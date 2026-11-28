// Independent diffuse transport reference for the E12 static W0 diagnostic.
// Does not use AIR, a screen-space approximation, or the product concept image.
#include <algorithm>
#include <array>
#include <bit>
#include <cmath>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <vector>

namespace {
constexpr double pi = 3.14159265358979323846;
constexpr double eps = 1.e-5;
constexpr int width = 160, height = 160;
constexpr std::array<int, 4> checkpoints{1, 16, 64, 256};
constexpr uint64_t seed = 20261127;

struct V {
    double x{}, y{}, z{};
    V operator+(V b) const { return {x + b.x, y + b.y, z + b.z}; }
    V operator-(V b) const { return {x - b.x, y - b.y, z - b.z}; }
    V operator*(double k) const { return {x * k, y * k, z * k}; }
    V operator*(V b) const { return {x * b.x, y * b.y, z * b.z}; }
    double operator[](int i) const { return i == 0 ? x : i == 1 ? y : z; }
};
double dot(V a, V b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
V cross(V a, V b) {
    return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}
V unit(V a) { return a * (1 / std::sqrt(dot(a, a))); }

struct Random {
    uint64_t state;
    double next() {
        // SplitMix64, fixed stream per pixel. Higher spp extends the same stream.
        uint64_t z = (state += 0x9e3779b97f4a7c15ULL);
        z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ULL;
        z = (z ^ (z >> 27)) * 0x94d049bb133111ebULL;
        return double((z ^ (z >> 31)) >> 11) * 0x1.0p-53;
    }
};
struct Ray { V p, d; };
struct Hit {
    double t = std::numeric_limits<double>::infinity();
    V n, reflectance;
    bool light = false;
};
constexpr V white{0.73, 0.73, 0.73};
constexpr V red{0.72, 0.07, 0.05};
constexpr V green{0.07, 0.66, 0.10};
constexpr V emission{14, 14, 14};
constexpr double light_y = 1.995, light_x = 0.26, light_z_min = -0.8, light_z_max = -0.24;

void plane(Hit& h, const Ray& r, int axis, double k, V n, V albedo, V minimum, V maximum, bool light = false) {
    if (std::abs(r.d[axis]) < eps) return;
    const double t = (k - r.p[axis]) / r.d[axis];
    if (t <= eps || t >= h.t) return;
    const V p = r.p + r.d * t;
    for (int i = 0; i < 3; ++i) {
        if (i != axis && (p[i] < minimum[i] || p[i] > maximum[i])) return;
    }
    h = {t, n, albedo, light};
}

Hit intersect(const Ray& r) {
    Hit h;
    constexpr V low{-1, 0, -2}, high{1, 2, 0};
    plane(h, r, 0, -1, {1, 0, 0}, red, low, high);
    plane(h, r, 0, 1, {-1, 0, 0}, green, low, high);
    plane(h, r, 1, 0, {0, 1, 0}, white, low, high);
    plane(h, r, 1, 2, {0, -1, 0}, white, low, high);
    plane(h, r, 2, -2, {0, 0, 1}, white, low, high);
    plane(h, r, 1, light_y, {0, -1, 0}, {}, {-light_x, 0, light_z_min}, {light_x, 0, light_z_max}, true);

    constexpr V a{0.22, 0, -1.59}, b{0.69, 0.93, -1.03};
    plane(h, r, 0, a.x, {-1, 0, 0}, white, a, b);
    plane(h, r, 0, b.x, {1, 0, 0}, white, a, b);
    plane(h, r, 1, b.y, {0, 1, 0}, white, a, b);
    plane(h, r, 2, a.z, {0, 0, -1}, white, a, b);
    plane(h, r, 2, b.z, {0, 0, 1}, white, a, b);
    constexpr V center{-0.42, 0.36, -0.69};
    constexpr double radius = 0.36;
    const V off = r.p - center;
    const double along = dot(off, r.d);
    const double d = along * along - dot(off, off) + radius * radius;
    if (d >= 0) {
        const double t = -along - std::sqrt(d);
        if (t > eps && t < h.t) h = {t, unit(off + r.d * t), white, false};
    }
    return h;
}

V sample_cosine(V n, Random& rng) {
    const double u = rng.next();
    const double angle = 2 * pi * rng.next();
    const V t = unit(cross(std::abs(n.y) < 0.9 ? V{0, 1, 0} : V{1, 0, 0}, n));
    const V b = cross(n, t);
    return unit(t * (std::sqrt(u) * std::cos(angle)) + b * (std::sqrt(u) * std::sin(angle)) +
                n * std::sqrt(1 - u));
}

V direct(V p, const Hit& h, Random& rng) {
    const V light{(2 * rng.next() - 1) * light_x, light_y,
                  light_z_min + rng.next() * (light_z_max - light_z_min)};
    const V delta = light - p;
    const double dist2 = dot(delta, delta);
    const V d = unit(delta);
    const double geometry = dot(d, h.n) * d.y;
    if (dot(d, h.n) <= 0 || d.y <= 0) return {};
    const Hit shadow = intersect({p, d});
    if (!shadow.light || std::abs(shadow.t - std::sqrt(dist2)) > 4 * eps) return {};
    constexpr double area = 2 * light_x * (light_z_max - light_z_min);
    return emission * h.reflectance * (geometry * area / (pi * dist2));
}

std::pair<V, V> sample(Ray r, Random& rng) {
    V full{}, first{}, weight{1, 1, 1};
    // Surface-emitter hits after the eye segment are not counted: every diffuse
    // vertex already integrates the area light through next-event estimation.
    for (int bounce = 0; bounce < 9; ++bounce) {
        const Hit h = intersect(r);
        if (!std::isfinite(h.t)) break;
        if (h.light) {
            if (bounce == 0 && dot(h.n, r.d) < 0) return {emission, emission};
            break;
        }
        const V p = r.p + r.d * h.t + h.n * (4 * eps);
        const V surface = direct(p, h, rng);
        if (bounce == 0) first = surface;
        full = full + weight * surface;
        weight = weight * h.reflectance;
        r = {p, sample_cosine(h.n, rng)};
    }
    return {full, first};
}

void save(const std::filesystem::path& out, const std::string& name, const std::vector<V>& pixels) {
    std::ofstream pfm(out / (name + ".pfm"), std::ios::binary);
    std::ofstream ppm(out / (name + ".ppm"), std::ios::binary);
    pfm.exceptions(std::ios::failbit | std::ios::badbit);
    ppm.exceptions(std::ios::failbit | std::ios::badbit);
    pfm << "PF\n" << width << ' ' << height << "\n"
        << (std::endian::native == std::endian::little ? "-1.0\n" : "1.0\n");
    ppm << "P6\n" << width << ' ' << height << "\n255\n";
    for (int y = height - 1; y >= 0; --y) {
        for (int x = 0; x < width; ++x) {
            V v = pixels[y * width + x];
            const float data[3] = {float(v.x), float(v.y), float(v.z)};
            pfm.write(reinterpret_cast<const char*>(data), sizeof(data));
        }
    }
    for (V v : pixels) {
        for (int c = 0; c < 3; ++c) {
            const double l = std::clamp(v[c], 0.0, 1.0);
            const double s = l <= 0.0031308 ? 12.92 * l : 1.055 * std::pow(l, 1.0 / 2.4) - 0.055;
            ppm.put(static_cast<char>(std::lround(s * 255)));
        }
    }
}
} // namespace

int main(int argc, char** argv) try {
    if (argc != 2) throw std::runtime_error("usage: cornell-reference NEW_OUTPUT_DIRECTORY");
    const std::filesystem::path out(argv[1]);
    if (!std::filesystem::create_directory(out)) throw std::runtime_error("Output already exists");
    std::array<std::vector<V>, checkpoints.size()> images;
    for (auto& a : images) a.resize(width * height);
    std::vector<V> control(width * height);
    constexpr V eye{0, 1.03, 3.1};
    constexpr double half_fov_tan = 0.2867453858; // vertical FOV 32 degrees.
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            const auto i = y * width + x;
            Random rng{seed + uint64_t(i) * 0xd1342543de82ef95ULL};
            V full{}, first{};
            size_t next = 0;
            for (int s = 1; s <= checkpoints.back(); ++s) {
                const double dx = (2 * ((x + rng.next()) / width) - 1) * half_fov_tan;
                const double dy = (1 - 2 * ((y + rng.next()) / height)) * half_fov_tan;
                const auto [all, primary] = sample({eye, unit({dx, dy, -1})}, rng);
                full = full + all;
                first = first + primary;
                if (s == checkpoints[next]) images[next++][i] = full * (1.0 / s);
            }
            control[i] = first * (1.0 / checkpoints.back());
        }
    }
    for (size_t i = 0; i < checkpoints.size(); ++i) {
        save(out, "cornell-" + std::to_string(checkpoints[i]) + "spp", images[i]);
    }
    save(out, "cornell-direct-256spp", control);
    std::cout << "E12 static diagnostic: 160x160, seed 20261127, 1/16/64/256 spp, RGB32F and sRGB preview\n";
    return 0;
} catch (const std::exception& e) {
    std::cerr << e.what() << '\n';
    return 1;
}
