const { cleanDescription: unifiedCleanDescription } = require('../scraper/unified/cleaner');

function cleanDescription(input) {
  return unifiedCleanDescription(input);
}

module.exports = {
  cleanDescription
};
