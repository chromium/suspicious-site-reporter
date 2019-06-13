// Copyright 2019 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

goog.provide('publicsuffix.Tld');

goog.require('goog.asserts');
goog.require('goog.string');
goog.require('goog.structs.Trie');
goog.require('publicsuffix.publicsuffixpatterns');

goog.scope(function() {
var publicsuffixpatterns = publicsuffix.publicsuffixpatterns;



/**
 * The class for determining the top-level domain of a given host.
 * @constructor
 * @struct
 */
publicsuffix.Tld = function() {
  /** @private @const {!goog.structs.Trie<boolean>} */
  this.exactPatterns_ = Tld.createTrie_(publicsuffixpatterns.EXACT);

  /** @private @const {!goog.structs.Trie<boolean>} */
  this.excludePatterns_ = Tld.createTrie_(publicsuffixpatterns.EXCLUDED);

  /** @private @const {!goog.structs.Trie<boolean>} */
  this.wildcardPatterns_ = Tld.createTrie_(publicsuffixpatterns.UNDER);
};
var Tld = publicsuffix.Tld;
goog.addSingletonGetter(Tld);


/**
 * Gets the top-level domain (also known as public suffix) of the given host.
 * The top-level domain is the suffix of the domain name under which other
 * domain names can be registered. For example the top-level domain of
 * 'www.google.com' is 'com', the top-level domain of 'www.google.co.uk' is
 * 'co.uk'. All top-level domain definitions in the public suffix list of
 * Mozilla are considered, but it can also be restricted to official top-level
 * domain definitions by ICANN.
 * @param {string} host The host name.
 * @param {boolean} icannOnly True if only official ICANN public suffixes are
 *     allowed, otherwise all TLDs from the public suffix list will be
 *     recognized.
 * @return {string} The top-level domain.
 */
Tld.prototype.getTld = function(host, icannOnly) {
  // Reverse the host name.
  host = host.split('').reverse().join('');

  // Check for the earliest match with a valid tld.
  // It can either be an exact match.
  var tldCandidate =
      Tld.getLongestMatch_(this.exactPatterns_, host, icannOnly);
  // Or be the suffix of an exact match with an exclude tld.
  var excludeCandidate =
      Tld.getLongestMatch_(this.excludePatterns_, host, icannOnly);
  if (excludeCandidate.length > 0) {
    goog.asserts.assert(excludeCandidate.indexOf('.') >= 0);
    excludeCandidate =
        excludeCandidate.substr(0, excludeCandidate.lastIndexOf('.'));
    if (excludeCandidate.length > tldCandidate.length) {
      tldCandidate = excludeCandidate;
    }
  }
  // Or be a tld without dots which allows any preceding string.
  var wildcardCandidate =
      Tld.getLongestMatch_(this.wildcardPatterns_, host, icannOnly);
  if (wildcardCandidate.length > 0 &&
      host.length > wildcardCandidate.length &&
      wildcardCandidate.length != excludeCandidate.length) {
    host = host.substr(wildcardCandidate.length + 1);
    wildcardCandidate += '.' + host.split('.')[0];
    if (wildcardCandidate.length > tldCandidate.length) {
      tldCandidate = wildcardCandidate;
    }
  }
  // Reverse the match to get the original string orientation.
  return tldCandidate.split('').reverse().join('');
};


/**
 * Determines the longest top-level domain in the trie that matches the given
 * host. Only accept matches that fulfill the |icannOnly| requirement.
 * @param {!goog.structs.Trie.<boolean>} trie The trie containing the top-level
 *     domains.
 * @param {string} host The reversed host name.
 * @param {boolean} icannOnly True iff only official ICANN public suffixes are
 *     allowed.
 * @return {string} The longest matching top-level domain if there is one.
 * @private
 */
Tld.getLongestMatch_ = function(trie, host, icannOnly) {
  // Check for the earliest exact match matching |host| completely, or a match
  // where the next character in |host| is a dot. If |icannOnly| is true, ignore
  // matches which correspond to private public suffix definitions.
  var maxLength = -1;
  var matches = trie.getKeyAndPrefixes(host);
  for (var positionKey in matches) {
    var position = parseInt(positionKey, 10);
    if ((position + 1 == host.length || host.charAt(position + 1) == '.') &&
        (!icannOnly || matches[positionKey] == true) && position > maxLength) {
      maxLength = position;
    }
  }
  return host.substr(0, maxLength + 1);
};


/**
 * Create a trie from the given encoded trie.
 * @param {string} pattern The encoding of the trie as a pre-order traversal.
 * @return {!goog.structs.Trie.<boolean>} The decoded trie.
 * @private
 */
Tld.createTrie_ = function(pattern) {
  var trie = new goog.structs.Trie();
  var idx = Tld.doParseTrie_(0, '', pattern, trie);
  // Assert that we indeed parsed the whole representation of the trie.
  goog.asserts.assert(idx == pattern.length);
  return trie;
};


/**
 * Parse the encoded trie recursively.
 * @param {number} idx The start index for parsing the pattern.
 * @param {string} prefix The characters on the path to the current node.
 * @param {string} pattern The encoded trie.
 * @param {!goog.structs.Trie<boolean>} trie The trie to be constructed.
 * @return {number} The index of the next character to be parsed.
 * @private
 */
Tld.doParseTrie_ = function(idx, prefix, pattern, trie) {
  // '!' represents an interior node that is an ICANN public suffix definition.
  // ':' represents an interior node that is a private public suffix definition.
  // '?' represents a leaf node that is an ICANN public suffix definition.
  // ',' represents a leaf node that is a private public suffix definition.
  // '&' represents an interior node that does not belong to the set of public
  //     suffix definitions.
  // First process all nodes until we hit either a leave or an interior
  // splitting node.
  var c = '\0';
  for (; idx < pattern.length; idx++) {
    c = pattern.charAt(idx);
    // Check if c is one of the special characters.
    if (goog.string.contains('!:?,&', c)) {
      // If the current prefix belongs to the set of tlds, store it in the trie.
      if (c != '&') {
        trie.set(prefix, c == '!' || c == '?');
      }
      break;
    }
    prefix += c;
  }
  goog.asserts.assert(idx < pattern.length);

  // Skip the special character.
  idx++;

  // If the current node is a leave node, we can stop here.
  if (c == '?' || c == ',') {
    return idx;
  }

  // We keep processing the subtrees until we hit a '?' character indicating we
  // are done with the current node.
  do {
    idx = Tld.doParseTrie_(idx, prefix, pattern, trie);
    c = pattern.charAt(idx);
  } while (c != '?' && c != ',');

  // Return idx + 1 because we also need to consume the last '?' character.
  return idx + 1;
};
});  // goog.scope
