using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

internal static class WindowsDirectoryFlush
{
    private const uint GenericWrite = 0x40000000;
    private const uint ShareReadWriteDelete = 7;
    private const uint OpenExisting = 3;
    private const uint BackupSemantics = 0x02000000;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, ExactSpelling = true)]
    private static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security,
        uint disposition, uint flags, IntPtr template);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool FlushFileBuffers(SafeFileHandle handle);

    private static int Main(string[] args)
    {
        if (args.Length != 1) return 2;
        try
        {
            using (SafeFileHandle handle = CreateFileW(args[0], GenericWrite, ShareReadWriteDelete,
                IntPtr.Zero, OpenExisting, BackupSemantics, IntPtr.Zero))
            {
                if (handle.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
                if (!FlushFileBuffers(handle)) throw new Win32Exception(Marshal.GetLastWin32Error());
                return 0;
            }
        }
        catch (Win32Exception error)
        {
            Console.Error.WriteLine("Win32 error {0}: {1}", error.NativeErrorCode, error.Message);
            return 1;
        }
    }
}
