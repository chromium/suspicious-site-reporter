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

/**
 * @fileoverview Retrieve relevant alerts for a site.
 */

goog.module('suspiciousSiteReporter.alerts');

const Tld = goog.require('publicsuffix.Tld');

/** @const {!Object<string, string>} Map of signals to messages for the UI. */
const ALERT_MESSAGES = {
  'isIDN': 'Domain uses uncommon characters',
  'longSubdomains': 'Unusually long subdomains',
  'notTopSite': 'Site not in top 5k sites',
  'notVisitedBefore': 'Haven\'t visited site in the last 3 months',
  'manySubdomains': 'Unusually many subdomains',
};

/** @const {number} If a domain has this many subdomains or more, it is flagged. */
const NUM_SUSPICIOUS_SUBDOMAINS = 4;

/**
 * @const {number} If a domain has a subdomain with this many characters or
 * more, it is flagged.
 */
const SUSPICIOUS_SUBDOMAIN_LENGTH = 22;

/** {!Object<string, boolean>} Dictionary with top site domains as keys. */
let topSitesList = {};

/**
 * Returns the domain from a URL.
 * @param {string} url The URL of a page.
 * @return {string} The domain of the page.
 */
const getDomain = (url) => {
  return new URL(url).hostname;
};

/**
 * Returns the domain split into parts and excluding the tld.
 * @param {string} domain The domain of a page.
 * @return {!Array<string>} The domain of the page.
 */
const getDomainPartsWithoutTld = (domain) => {
  const suffix = '.' + Tld.getInstance().getTld(domain, true);
  return domain.slice(0, domain.lastIndexOf(suffix)).split('.');
};

/**
 * Determines whether the site uses an IDN.
 * @param {string} domain The domain of the page. Regardless of how the
 *     omnibox displays the URL, this should be encoded here.
 * @return {boolean} Whether domain has label starting with 'xn--' (is IDN).
 */
const isIDN = (domain) => {
  // Check that xn-- appears after '.' or at the start of the domain name.
  // Regex used instead of splitting by '.' because splitting causes
  // the international character encoding to get stripped out.
  const regexPunycode = /\.(xn--)/;
  return domain.startsWith('xn--') || regexPunycode.test(domain);
};

/**
 * Checks whether a site is in the top site list.
 * @param {string} domain The domain of the page.
 * @return {boolean} Whether the site is in the top 5k.
 */
const isTopSite = (domain) => {
  const suffix = '.' + Tld.getInstance().getTld(domain, true);
  const domainPartsWithoutTld = getDomainPartsWithoutTld(domain);
  const etldPlusOne =
      domainPartsWithoutTld[domainPartsWithoutTld.length - 1] + suffix;
  // The below assumes that the top sites list uses lower case only.
  return topSitesList[etldPlusOne.toLowerCase()];
};

/**
 * Fetches the top sites list from JSON.
 * @param {function(?)} callback Callback function.
 */
const fetchTopSites = (callback) => {
  const topSitesList = chrome.runtime.getURL('topsites.json');
  const xhr = new XMLHttpRequest();
  xhr.open('GET', topSitesList);
  xhr.onreadystatechange = () => {
    if (xhr.readyState === 4 && xhr.status === 200) {
      callback(JSON.parse(xhr.responseText));
    }
  };
  xhr.send();
};

/**
 * Sets the value of top sites list variable after fetching from JSON.
 */
const setTopSitesList = () => {
  fetchTopSites((topSites) => {
    topSitesList = topSites;
  });
};

/**
 * Determines whether user has visited specified domain within last 3 months.
 * We use 3 months because recently visited sites are more relevant and because
 * Chrome only stores 3 months of history. We also ignore sites visited today
 * for the first time to reduce false negatives.
 * @param {string} domain The domain of the page.
 * @return {!Promise<boolean>} Whether site was visited recently, before today.
 */
const visitedBeforeToday = (domain) => {
  // Visit time in Chrome history is in milliseconds since epoch, so convert
  // to this unit.
  const currentTime = new Date().getTime();
  const msInDay = 24 * 60 * 60 * 1000;
  const timeYesterday = currentTime - msInDay;
  const timeThreeMonthsAgo = currentTime - (msInDay * 90);
  return new Promise((resolve, reject) => {
    chrome.history.search(
        {
          text: '',  // empty string returns everything
          startTime: timeThreeMonthsAgo,
          endTime: timeYesterday,
          maxResults: 0  // unlimited
        },
        function(pages) {
          // If there is no browsing history returned, assume that the user has
          // browsing history turned off, meaning this signal is noisy. Resolve
          // true to effectively turn off this alert.
          if (pages.length === 0) resolve(true);
          resolve(pages.some((page) => getDomain(page.url) === domain));
        });
  });
};

/**
 * Determines whether the site has unusually many subdomains.
 * @param {string} domain The domain of the page.
 * @return {boolean} True if the site has many subdomains.
*/
const hasManySubdomains = (domain) => {
  const domainPartsWithoutTld = getDomainPartsWithoutTld(domain);
  return domainPartsWithoutTld.length >= NUM_SUSPICIOUS_SUBDOMAINS;
};

/**
 * Determines whether the site has unusually long subdomains.
 * @param {string} domain The domain of the page.
 * @return {boolean} True if the site has long subdomains.
 */
const hasLongSubdomains = (domain) => {
  const domainPartsWithoutTld = getDomainPartsWithoutTld(domain);
  return domainPartsWithoutTld.some(
      (subdomain) => subdomain.length >= SUSPICIOUS_SUBDOMAIN_LENGTH);
};

/**
 * Fetch redirect URLs from a referrer chain.
 * @param {string} url The URL of the current tab.
 * @param {number} tabId The ID of the tab for which to fetch the redirect URLs.
 * @return {!Promise<!Set<string>>} A list of URLs redirected through before
 *     landing on the current site.
 */
const fetchRedirectUrls = (url, tabId) => {
  const redirectUrls = new Set();
  if (chrome.safeBrowsingPrivate &&
      chrome.safeBrowsingPrivate.getReferrerChain) {
    return new Promise((resolve, reject) => {
      chrome.safeBrowsingPrivate.getReferrerChain(tabId, (referrer) => {
        for (const referrerEntry of referrer) {
          // The referrer chain is returned in order of recency, so after seeing
          // the first referrer chain entry that no longer contains a client
          // redirect, break out of the loop since subsequent entries likely
          // came from a user interaction, e.g. typing URL into the URL bar or
          // clicking a link, and were not part of the relevant stream of
          // redirects.
          if (referrerEntry.urlType !== 'CLIENT_REDIRECT') break;
          if (referrerEntry.referrerUrl) {
            // Since the current URL is visible in the URL bar, it is less
            // relevant when checking for suspicious redirects.
            if (referrerEntry.referrerUrl !== url)
              redirectUrls.add(referrerEntry.referrerUrl);
          }
          if (referrerEntry.serverRedirectChain) {
            referrerEntry.serverRedirectChain.forEach((serverRedirect) => {
              if (serverRedirect.url !== url)
                redirectUrls.add(serverRedirect.url);
            });
          }
        }
        resolve(redirectUrls);
      });
    });
  }
  return Promise.resolve(redirectUrls);
};

/**
 * Compute alerts and populate alerts array.
 * @param {string} url The URL of the page.
 * @param {number} tabId The ID of the current tab.
 * @return {!Promise<!Array<string>>} List of alerts for page.
 */
const computeAlerts = async (url, tabId) => {
  const newAlerts = [];
  const domain = getDomain(url).toLowerCase();
  const visited = await visitedBeforeToday(domain);
  // Only warn about IDNs when not on a top site.
  if (!isTopSite(domain)) {
    newAlerts.push(ALERT_MESSAGES['notTopSite']);
    if (isIDN(domain)) newAlerts.push(ALERT_MESSAGES['isIDN']);
  }
  if (!visited) newAlerts.push(ALERT_MESSAGES['notVisitedBefore']);
  if (hasManySubdomains(domain))
    newAlerts.push(ALERT_MESSAGES['manySubdomains']);
  if (hasLongSubdomains(domain))
    newAlerts.push(ALERT_MESSAGES['longSubdomains']);

  return new Promise((resolve) => {
    resolve(newAlerts);
  });
};

exports = {
  ALERT_MESSAGES,
  computeAlerts,
  fetchRedirectUrls,
  hasManySubdomains,
  hasLongSubdomains,
  isIDN,
  setTopSitesList,
  visitedBeforeToday,
};
