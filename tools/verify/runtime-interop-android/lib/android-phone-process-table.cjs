/* Android ps -o PID,NAME: NAME is the complete nonempty remainder, including kernel-thread spaces. */
function parseProcessTable(raw) {
    const lines = raw.trim().split(/\r?\n/);
    if (!/^\s*PID\s+NAME\s*$/.test(lines.shift())) throw Error('Unexpected Android process table');
    if (!lines.length) throw Error('Android process table is empty');
    return lines.map((line) => {
        const match = /^\s*(\d+)\s+(.+?)\s*$/.exec(line);
        if (!match) throw Error('Incomplete Android process table row');
        const pid = Number(match[1]);
        if (!Number.isSafeInteger(pid) || pid <= 0) throw Error('Invalid Android process PID');
        return { pid, name: match[2] };
    });
}

const isPackageProcess = (row, name) => row.name === name || row.name.startsWith(name + ':');
module.exports = { parseProcessTable, isPackageProcess };
