function requireFields(payload, fields) {
  const missing = fields.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === '');
  return {
    ok: missing.length === 0,
    missing
  };
}

module.exports = {
  requireFields
};
