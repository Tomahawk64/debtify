// Escapes regex metacharacters so arbitrary user input (e.g. a phone number
// search like "+13049455981") can be safely used inside a MongoDB $regex
// filter. Without this, a leading "+" (or any of . * ? ^ $ { } ( ) | [ ] \)
// makes the pattern invalid and MongoDB throws, crashing the request with a
// 500 instead of just finding no matches.
function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
