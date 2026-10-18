'use strict';
// Explicit collection helper. Only the reader can attest what its tool response actually showed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const repo = path.resolve(__dirname, '../../../..');
const { l0 } = require(path.join(repo, 'tools/skills/measure-tokens.cjs'));
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const [mode, snapshot, output, id, file] = process.argv.slice(2);
if (!mode || !snapshot || !output || !id) throw new Error('mode snapshot output scenario [file]');
const fixtureBytes = fs.readFileSync(path.join(repo, 'tools/skills/fixtures/load-scenarios.json'));
const scenario = JSON.parse(fixtureBytes).scenarios.find((row) => row.id === id);
if (!scenario) throw new Error('Unknown scenario');
const manifest = JSON.parse(fs.readFileSync(path.join(snapshot, 'manifest.json'), 'utf8'));
const metadataPath = path.join(output, 'trial.json');
if (mode === 'init') {
    fs.mkdirSync(output);
    fs.mkdirSync(path.join(output, 'payloads'));
    const metadata = {
        task_id: path.basename(output),
        scenario_id: id,
        started_at: new Date().toISOString(),
        snapshot_hash: manifest.snapshot_hash,
        source_snapshot_hash: scenario.source_snapshot_hash,
        scenario_fixture_hash: hash(fixtureBytes),
        question_hash: hash(scenario.question),
        read_protocol_hash: hash(JSON.stringify(scenario.read_protocol)),
        notes: [
            'Recovery run. Original path failures remain historical facts; no external documents are supplied to the frozen snapshot.',
        ],
        reads: [],
    };
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
    process.stdout.write(
        JSON.stringify({ question: scenario.question, read_protocol: scenario.read_protocol }, null, 2) + '\n',
    );
} else {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    if (metadata.answer_hash) throw new Error('Answer already sealed; no more reading or sealing');
    if (mode === 'l0') {
        if (metadata.l0_hash) throw new Error('L0 already emitted; do not hide repeated reads');
        const host = l0(path.join(snapshot, 'skills'));
        metadata.l0_hash = host.hash;
        fs.writeFileSync(path.join(output, 'l0.txt'), host.text);
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
        process.stdout.write(host.text);
    } else if (mode === 'read') {
        if (!metadata.l0_hash) throw new Error('Receive L0 first');
        const entry = manifest.files.find((row) => row.path === file);
        if (!entry) throw new Error('Path absent from frozen snapshot');
        const bytes = fs.readFileSync(path.join(snapshot, file));
        if (hash(bytes) !== entry.sha256) throw new Error('Frozen source hash mismatch');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        const payload = `payloads/${String(metadata.reads.length + 1).padStart(2, '0')}.txt`;
        fs.writeFileSync(path.join(output, payload), bytes);
        metadata.reads.push({
            path: file,
            content_hash: hash(bytes),
            read_chars: [...text].length,
            read_bytes: bytes.length,
            whole_file: true,
            fragments: [],
            payload,
            observed_at: new Date().toISOString(),
        });
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
        process.stdout.write(text);
    } else if (mode === 'seal') {
        const answer = fs.readFileSync(path.join(output, 'answer.md'));
        metadata.answer_artifact = 'answer.md';
        metadata.answer_hash = hash(answer);
        metadata.answer_sealed_at = new Date().toISOString();
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
        process.stdout.write(
            JSON.stringify(
                { answer_hash: metadata.answer_hash, completion_checks: scenario.completion_checks },
                null,
                2,
            ) + '\n',
        );
    } else throw new Error('Unknown mode');
}
