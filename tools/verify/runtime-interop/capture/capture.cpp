// Focused external OS-window capture. No engine WebGPU texture or runtime readback is used.
#include <windows.h>
#include <d3d11.h>
#include <dwmapi.h>
#include <wincodec.h>
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.directx.direct3d11.interop.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#include <chrono>
#include <condition_variable>
#include <cstring>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <thread>
#include <vector>

namespace capture = winrt::Windows::Graphics::Capture;
namespace directx = winrt::Windows::Graphics::DirectX;

struct Deadline {
    HANDLE done = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    std::thread watchdog;
    Deadline() {
        if (!done) throw std::runtime_error("Cannot create capture deadline event");
        watchdog = std::thread([this] {
            if (WaitForSingleObject(done, 5000) != WAIT_OBJECT_0) {
                std::cerr << "Windows Graphics Capture exceeded its original five-second budget" << std::endl;
                TerminateProcess(GetCurrentProcess(), 124);
            }
        });
    }
    ~Deadline() {
        SetEvent(done);
        watchdog.join();
        CloseHandle(done);
    }
};

void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

struct WindowsForPid {
    DWORD pid;
    std::vector<HWND> windows;
};

BOOL CALLBACK collectWindow(HWND window, LPARAM data) {
    auto& search = *reinterpret_cast<WindowsForPid*>(data);
    DWORD owner = 0;
    GetWindowThreadProcessId(window, &owner);
    if (owner == search.pid && IsWindowVisible(window) && !GetWindow(window, GW_OWNER)) {
        RECT client{};
        if (GetClientRect(window, &client) && client.right > 0 && client.bottom > 0)
            search.windows.push_back(window);
    }
    return TRUE;
}

void checkOwner(HWND window, DWORD pid) {
    DWORD owner = 0;
    GetWindowThreadProcessId(window, &owner);
    require(IsWindow(window) && IsWindowVisible(window) && !IsIconic(window) && owner == pid,
        "Target window is missing, hidden, minimized or belongs to another process");
}

RECT clientScreenRect(HWND window) {
    RECT client{};
    POINT origin{};
    require(GetClientRect(window, &client) && ClientToScreen(window, &origin), "Cannot locate client rectangle");
    OffsetRect(&client, origin.x, origin.y);
    return client;
}

RECT cropRect(HWND window, RECT client, int width, int height) {
    RECT bounds{};
    RECT extended{};
    require(GetWindowRect(window, &bounds), "Cannot locate window rectangle");
    const bool hasExtended = SUCCEEDED(DwmGetWindowAttribute(window, DWMWA_EXTENDED_FRAME_BOUNDS,
        &extended, sizeof(extended)));
    const auto matches = [width, height](RECT rect) {
        return rect.right - rect.left == width && rect.bottom - rect.top == height;
    };
    RECT origin{};
    if (hasExtended && matches(extended)) origin = extended;
    else if (matches(bounds)) origin = bounds;
    else if (matches(client)) origin = client;
    else throw std::runtime_error("Capture dimensions do not match window, DWM or client bounds; refusing guessed crop");
    OffsetRect(&client, -origin.left, -origin.top);
    require(client.left >= 0 && client.top >= 0 && client.right <= width && client.bottom <= height,
        "Client crop lies outside the captured OS window");
    return client;
}

void writePng(const std::filesystem::path& file, UINT width, UINT height, std::vector<uint8_t>& pixels) {
    // Reserve exactly the caller's new output; never replace an earlier capture.
    HANDLE reservation = CreateFileW(file.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
    require(reservation != INVALID_HANDLE_VALUE, "PNG output must be a new writable file");
    CloseHandle(reservation);
    auto factory = winrt::create_instance<IWICImagingFactory>(CLSID_WICImagingFactory);
    winrt::com_ptr<IWICStream> stream;
    winrt::check_hresult(factory->CreateStream(stream.put()));
    winrt::check_hresult(stream->InitializeFromFilename(file.c_str(), GENERIC_WRITE));
    winrt::com_ptr<IWICBitmapEncoder> encoder;
    winrt::check_hresult(factory->CreateEncoder(GUID_ContainerFormatPng, nullptr, encoder.put()));
    winrt::check_hresult(encoder->Initialize(stream.get(), WICBitmapEncoderNoCache));
    winrt::com_ptr<IWICBitmapFrameEncode> frame;
    winrt::check_hresult(encoder->CreateNewFrame(frame.put(), nullptr));
    winrt::check_hresult(frame->Initialize(nullptr));
    winrt::check_hresult(frame->SetSize(width, height));
    WICPixelFormatGUID format = GUID_WICPixelFormat32bppBGRA;
    winrt::check_hresult(frame->SetPixelFormat(&format));
    require(IsEqualGUID(format, GUID_WICPixelFormat32bppBGRA), "PNG encoder changed the BGRA pixel contract");
    winrt::check_hresult(frame->WritePixels(height, width * 4, static_cast<UINT>(pixels.size()), pixels.data()));
    winrt::check_hresult(frame->Commit());
    winrt::check_hresult(encoder->Commit());
}

int captureWindow(DWORD pid, const std::filesystem::path& output) {
    Deadline deadline;
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
    require(capture::GraphicsCaptureSession::IsSupported(), "Windows Graphics Capture is unavailable");
    WindowsForPid search{pid, {}};
    EnumWindows(collectWindow, reinterpret_cast<LPARAM>(&search));
    require(search.windows.size() == 1, "Expected exactly one visible top-level window owned by the supplied PID");
    const HWND window = search.windows.front();
    checkOwner(window, pid);
    const RECT clientBefore = clientScreenRect(window);

    winrt::com_ptr<ID3D11Device> device;
    winrt::com_ptr<ID3D11DeviceContext> context;
    winrt::check_hresult(D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr,
        D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0, D3D11_SDK_VERSION, device.put(), nullptr, context.put()));
    auto dxgi = device.as<IDXGIDevice>();
    winrt::com_ptr<IInspectable> inspectable;
    winrt::check_hresult(CreateDirect3D11DeviceFromDXGIDevice(dxgi.get(), inspectable.put()));
    auto direct3d = inspectable.as<directx::Direct3D11::IDirect3DDevice>();
    auto interop = winrt::get_activation_factory<capture::GraphicsCaptureItem, IGraphicsCaptureItemInterop>();
    capture::GraphicsCaptureItem item{nullptr};
    winrt::check_hresult(interop->CreateForWindow(window, winrt::guid_of<capture::GraphicsCaptureItem>(),
        winrt::put_abi(item)));
    auto pool = capture::Direct3D11CaptureFramePool::CreateFreeThreaded(direct3d,
        directx::DirectXPixelFormat::B8G8R8A8UIntNormalized, 2, item.Size());
    std::mutex mutex;
    std::condition_variable ready;
    capture::Direct3D11CaptureFrame captured{nullptr};
    std::exception_ptr failure;
    auto token = pool.FrameArrived([&](const capture::Direct3D11CaptureFramePool& sender, const auto&) {
        std::lock_guard lock(mutex);
        if (captured || failure) return;
        try { captured = sender.TryGetNextFrame(); }
        catch (...) { failure = std::current_exception(); }
        ready.notify_one();
    });
    auto session = pool.CreateCaptureSession(item);
    session.IsCursorCaptureEnabled(false);
    session.StartCapture();
    {
        std::unique_lock lock(mutex);
        require(ready.wait_for(lock, std::chrono::seconds(5), [&] { return captured || failure; }),
            "No real OS FrameArrived event before capture deadline");
    }
    pool.FrameArrived(token);
    if (failure) std::rethrow_exception(failure);
    checkOwner(window, pid);
    const RECT clientAfter = clientScreenRect(window);
    require(EqualRect(&clientBefore, &clientAfter), "Window moved or resized while capturing");
    const auto size = captured.ContentSize();
    const RECT crop = cropRect(window, clientAfter, size.Width, size.Height);
    const UINT width = static_cast<UINT>(crop.right - crop.left);
    const UINT height = static_cast<UINT>(crop.bottom - crop.top);
    auto access = captured.Surface().as<Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess>();
    winrt::com_ptr<ID3D11Texture2D> surface;
    winrt::check_hresult(access->GetInterface(__uuidof(ID3D11Texture2D), surface.put_void()));
    D3D11_TEXTURE2D_DESC description{};
    surface->GetDesc(&description);
    require(description.Format == DXGI_FORMAT_B8G8R8A8_UNORM && width && height,
        "Unexpected OS capture texture format or empty client rectangle");
    description.Width = width;
    description.Height = height;
    description.MipLevels = 1;
    description.ArraySize = 1;
    description.Usage = D3D11_USAGE_STAGING;
    description.BindFlags = 0;
    description.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
    description.MiscFlags = 0;
    winrt::com_ptr<ID3D11Texture2D> staging;
    winrt::check_hresult(device->CreateTexture2D(&description, nullptr, staging.put()));
    const D3D11_BOX box{static_cast<UINT>(crop.left), static_cast<UINT>(crop.top), 0,
        static_cast<UINT>(crop.right), static_cast<UINT>(crop.bottom), 1};
    context->CopySubresourceRegion(staging.get(), 0, 0, 0, 0, surface.get(), 0, &box);
    D3D11_MAPPED_SUBRESOURCE mapped{};
    winrt::check_hresult(context->Map(staging.get(), 0, D3D11_MAP_READ, 0, &mapped));
    std::vector<uint8_t> pixels(static_cast<size_t>(width) * height * 4);
    for (UINT row = 0; row < height; row++)
        std::memcpy(pixels.data() + static_cast<size_t>(row) * width * 4,
            static_cast<const uint8_t*>(mapped.pData) + static_cast<size_t>(row) * mapped.RowPitch, width * 4);
    context->Unmap(staging.get(), 0);
    session.Close();
    captured.Close();
    pool.Close();
    checkOwner(window, pid);
    writePng(output, width, height, pixels);
    std::ostringstream handle;
    handle << "0x" << std::hex << reinterpret_cast<uintptr_t>(window);
    std::cout << "{\"channel\":\"windows-graphics-capture\",\"pid\":" << pid
        << ",\"hwnd\":" << std::quoted(handle.str()) << ",\"width\":" << width << ",\"height\":" << height
        << ",\"file\":" << std::quoted(winrt::to_string(output.wstring()))
        << ",\"captureWidth\":" << size.Width << ",\"captureHeight\":" << size.Height
        << ",\"crop\":{\"x\":" << crop.left << ",\"y\":" << crop.top << ",\"width\":" << width
        << ",\"height\":" << height << "}}" << std::endl;
    return 0;
}

int wmain(int argc, wchar_t** argv) {
    try {
        require(argc == 5 && std::wstring(argv[1]) == L"--pid" && std::wstring(argv[3]) == L"--out",
            "Usage: cocosair-runtime-capture --pid <owned-child-pid> --out <new.png>");
        size_t consumed = 0;
        const auto number = std::stoul(argv[2], &consumed);
        require(number > 0 && consumed == std::wstring(argv[2]).size(), "Invalid process ID");
        const auto output = std::filesystem::absolute(argv[4]).lexically_normal();
        require(!std::filesystem::exists(output) && std::filesystem::is_directory(output.parent_path()),
            "Capture output must be a new file in an existing directory");
        return captureWindow(static_cast<DWORD>(number), output);
    } catch (const winrt::hresult_error& error) {
        std::cerr << winrt::to_string(error.message()) << " HRESULT=0x" << std::hex
            << static_cast<uint32_t>(error.code().value) << std::endl;
    } catch (const std::exception& error) {
        std::cerr << error.what() << std::endl;
    }
    return 1;
}
