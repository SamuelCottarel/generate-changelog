'use strict';

var Bluebird = require('bluebird');

var DEFAULT_TYPE = 'other';
var PR_REGEX = new RegExp(/#[1-9][\d]*/g);
var TYPES = {
  breaking: 'Breaking Changes :boom:',
  build: 'Build System / Dependencies :construction_worker: :arrow_up:',
  ci: 'Continuous Integration :rocket:',
  docs: 'Documentation Changes :memo:',
  feat: 'New Features :sparkles:',
  fix: 'Bug Fixes :bug:',
  perf: 'Performance Improvements :zap:',
  refactor: 'Refactors :recycle:',
  style: 'Code Style Changes :art: :lipstick:',
  test: 'Tests 🧪',
  other: 'Other Changes :question:'
};

/**
 * Generate the commit URL for the repository provider.
 * @param {String} baseUrl - The base URL for the project
 * @param {String} commitHash - The commit hash being linked
 * @return {String} The URL pointing to the commit
 */
exports.getCommitUrl = function (baseUrl, commitHash) {
  var urlCommitName = 'commit';

  if (baseUrl.indexOf('bitbucket') !== -1) {
    urlCommitName = 'commits';
  }

  if (baseUrl.indexOf('gitlab') !== -1 && baseUrl.slice(-4) === '.git') {
    baseUrl = baseUrl.slice(0, -4);
  }

  return baseUrl + '/' + urlCommitName + '/' + commitHash;
};

/**
 * Generate the markdown for the changelog.
 * @param {String} version - the new version affiliated to this changelog
 * @param {Array<Object>} commits - array of parsed commit objects
 * @param {Object} options - generation options
 * @param {Boolean} options.patch - whether it should be a patch changelog
 * @param {Boolean} options.minor - whether it should be a minor changelog
 * @param {Boolean} options.major - whether it should be a major changelog
 * @param {String} options.repoUrl - repo URL that will be used when linking commits
 * @returns {Promise<String>} the \n separated changelog string
 */
exports.markdown = function (version, commits, options) {
  var content = [];
  var date = new Date().toJSON().slice(0, 10);
  var heading;

  if (options.major) {
    heading = '##';
  } else if (options.minor) {
    heading = '###';
  } else {
    heading = '####';
  }

  if (version) {
    heading += ' ' + version + ' (' + date + ')';
  } else {
    heading += ' ' + date;
  }

  content.push(heading);
  content.push('');

  return Bluebird.resolve(commits)
  .bind({ types: {} })
  .each(function (commit) {
    var type = TYPES[commit.type] || options.allowUnknown ? commit.type : DEFAULT_TYPE;
    var category = commit.category;

    this.types[type] = this.types[type] || {};
    this.types[type][category] = this.types[type][category] || [];

    this.types[type][category].push(commit);
  })
  .then(function () {
    return Object.keys(this.types).sort();
  })
  .each(function (type) {
    var types = this.types;
    var typeDescription = TYPES[type];

    if (!typeDescription && options.allowUnknown) {
      typeDescription = TYPES.other + ' (' + type + ')';
    }

    content.push('##### ' + typeDescription);
    content.push('');

    Object.keys(this.types[type]).forEach(function (category) {
      var prefix = '*';
      var nested = types[type][category].length > 1;
      var categoryHeading = prefix + (category ? ' **' + category + ':**' : '');

      if (nested && category) {
        content.push(categoryHeading);
        prefix = '  *';
      } else {
        prefix = categoryHeading;
      }

      types[type][category].forEach(function (commit) {
        var shorthash = commit.hash.substring(0, 8);
        var subject = commit.subject;
        var body = commit.body;

        if (options.repoUrl) {
          if (type === 'breaking') {
            shorthash = '<a href="' + exports.getCommitUrl(options.repoUrl, commit.hash) + '">' + shorthash + '</a>';

            subject = subject.replace(PR_REGEX, function (pr) {
              return '<a href="' + options.repoUrl + '/pull/' + pr.slice(1) + '">' + pr + '</a>';
            });
          } else {

            shorthash = '[' + shorthash + '](' + exports.getCommitUrl(options.repoUrl, commit.hash) + ')';

            subject = subject.replace(PR_REGEX, function (pr) {
              return '[' + pr + '](' + options.repoUrl + '/pull/' + pr.slice(1) + ')';
            });
          }
        }

        var breaking = commit.flagIfBreaking ? '(' + commit.flagIfBreaking + '): ' : '';
        body = body ? body.replace(/(\n)+(END BREAKING CHANGE)(.)*(\n)*(.)*(\n)*(.)*(\n)*(.)*(\n)*(.)*/g, '$1 ') : '';
        body = body ? body.replace(/(\n)+(See)(.)*(\n)*(.)*(\n)*(.)*(\n)*(.)*/g, '$1 ') : '';
        body = body ? body.replace(/(\n)+(Closes)(.)*(\n)*(.)*(\n)*(.)*/g, '$1 ') : '';
        body = '      ' + body;
        body = body ? body.replaceAll('\n', '\n      ') : '';
        body = '\n   * <details>\n      <summary>' + breaking + subject.trim() + ' (' + shorthash + ')</summary>\n\n' + body;
        body += '</details>';
        if (type === 'breaking' && body) {
          if (prefix === '*') {
            body = body.trim();
            content.push(' ' + body);
          } else {
            content.push(prefix + ' ' + body);
          }
        } else {
          content.push(prefix + ' ' + breaking + subject.trim() + ' (' + shorthash + ')');
        }

      });
    });

    content.push('');
  })
  .then(function () {
    content.push('');
    return content.join('\n');
  });
};
