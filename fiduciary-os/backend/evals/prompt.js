// Builds the same system prompt the API sends, so live evals test the real policy.
const policy = require('../src/services/aiPolicy.json');

module.exports = function ({ vars }) {
  return [
    { role: 'system', content: policy.systemPrompt },
    { role: 'user', content: vars.question },
  ];
};
