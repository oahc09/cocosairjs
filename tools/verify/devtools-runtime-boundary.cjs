// Runtime session scopes legitimately contain AIR_E_SESSION_CLOSED. Do not match its suffix.
const markers = ['createAgentSession', 'v051-agent-contract'];
exports.developmentRuntimeMarkers = (code) => markers.filter((marker) => code.includes(marker));
