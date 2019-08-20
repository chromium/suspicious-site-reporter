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
 * @fileoverview Background script to handle retrieving information from active
 * tab for reporting and alerting purposes.
 */

goog.module('suspiciousSiteReporter.Background');

const ClientRequest = goog.require('proto.suspiciousSiteReporter.extension.ChromeExtensionClientRequest');
const ReferrerChainEntry = goog.require('proto.suspiciousSiteReporter.extension.ReferrerChainEntry');
const alerts = goog.require('suspiciousSiteReporter.alerts');

/**
 * The API URL used for submitting reports.
 * @define {string} This may be redefined at build time to point at the
 *     prod endpoint.
 */
const API_URL = goog.define('API_URL', 'https://test-safebrowsing.google.com');

/**
 * Converts a data URL to a Uint8Array representation of the screenshot.
 * @param {string} dataUrl URL representation of an image with the following
 *     format: data:[<mediatype>][;base64],<data>
 * @return {!Uint8Array} A Uin8Array representation of the image.
 */
const getIntArrayFromDataUrl = dataUrl => {
  const urlParts = dataUrl.split(',');
  // Separate out the mime component, which comes after the data: prefix and
  // before ;base64. e.g., image/png for screenshot data.
  const mimeString =
      urlParts[0].split(':')[1].split(';')[0];
  // Since the data URL is retrieved from chrome.tabs.captureVisibleTab with
  // the format set to png, verify that the mimeString matches.
  if (mimeString !== 'image/png') {
    throw Error('Screenshot is in incorrect format');
  }
  // Convert base 64 to raw binary data held in a string. The data segment
  // comes after the comma in a data URL.
  const byteString = atob(urlParts[1]);
  // Write the bytes of the string to an ArrayBuffer.
  const intArray =
      new Uint8Array(new ArrayBuffer(byteString.length));
  byteString.split('').forEach((c, i) => {
    intArray[i] = c.charCodeAt(0);
  });
  return intArray;
};

/**
 * Converts a referrer from the extension API into a proto-compatible version.
 * @param {!chrome.safeBrowsingPrivate.ReferrerChainEntry} entry Referrer chain
 *     entry object retrieved from the extension API.
 * @return {!ReferrerChainEntry} A parsed ReferrerChainEntry.
 */
const parseReferrerEntry = entry => {
  const parsedEntry = new ReferrerChainEntry()
                          .setUrl(entry.url)
                          .setMainFrameUrl(entry.mainFrameUrl)
                          .setType(ReferrerChainEntry.URLType[entry.urlType]);
  if (entry.ipAddresses) {
    entry.ipAddresses.forEach((ipAddress) => {
      parsedEntry.addIpAddresses(ipAddress);
    });
  }
  parsedEntry.setReferrerUrl(entry.referrerUrl);
  parsedEntry.setReferrerMainFrameUrl(entry.referrerMainFrameUrl);
  parsedEntry.setIsRetargeting(entry.isRetargeting);
  parsedEntry.setNavigationTimeMsec(entry.navigationTimeMs);
  if (entry.serverRedirectChain) {
    entry.serverRedirectChain.forEach((serverRedirect) => {
      const redirect =
          new ReferrerChainEntry.ServerRedirect().setUrl(serverRedirect.url);
      parsedEntry.addServerRedirectChain(redirect);
    });
  }
  parsedEntry.setNavigationInitiation(
      ReferrerChainEntry.NavigationInitiation[entry.navigationInitiation]);
  parsedEntry.setMaybeLaunchedByExternalApplication(
      entry.maybeLaunchedByExternalApp);
  return parsedEntry;
};

class Background {
  constructor() {
    /** {?Array<string>} A list of suspicious signals on a site.  */
    this.alerts = undefined;
  }

  /**
   * Fetches number of alerts and sets icon badge.
   * @param {!Tab} tab A Chrome Tab instance.
   * @private
   */
  async getAlertBadge_(tab) {
    const alertList = await alerts.computeAlerts(tab.url, tab.id);
    this.alerts = alertList;

    /**
     * Sets the color of the flag icon.
     * @param {!string} color The color to set the flag. Will be one of orange,
     *     green, or gray.
     * @param {!Tab} tab A Chrome Tab instance.
     */
    const setFlagIconColor = (color, tab) => {
      chrome.browserAction.setIcon({
        path: {
          '16': `images/${color}flag16.png`,
          '48': `images/${color}flag48.png`,
          '128': `images/${color}flag128.png`,
        },
        tabId: tab.id,
      });
    };

    if (alertList.length === 0) {
      chrome.browserAction.setBadgeText({
        text: '',
        tabId: tab.id,
      });
      setFlagIconColor('green', tab);
      return;
    }
    // To reduce noise, show a gray flag if the only signal is the not top
    // site signal. This works because the top site signal is most useful when
    // a website is also flagged for other reasons.
    if (alertList.length === 1 &&
        alertList.includes(alerts.ALERT_MESSAGES['notTopSite'])) {
      chrome.browserAction.setBadgeText({
        text: '',
        tabId: tab.id,
      });
      setFlagIconColor('gray', tab);
    } else {
      chrome.browserAction.setBadgeText({
        text: alertList.length.toString(),
        tabId: tab.id,
      });
      setFlagIconColor('orange', tab);
    }
  }

  /**
   * Submits the report to Safe Browsing.
   * @param {?ClientRequest} data The data to send.
   * @param {string} domain The target domain for submitting the report request.
   * @private
   */
  submitReport_(data, domain) {
    const path = '/safebrowsing/clientreport/crx-report';
    const xhr = new XMLHttpRequest();
    xhr.open('POST', domain.concat(path), true);
    xhr.send(data.serialize());
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          chrome.runtime.sendMessage({'success': true});
        } else {
          chrome.runtime.sendMessage({'error': true});
        }
      }
    };
  }

  /**
   * Listens for a report message from the popup.
   * @param {!Object<string, *>} request Request object.
   * @param {!MessageSender} sender Message sender information.
   * @param {!Function} sendResponse function.
   * @private
   */
  onMessageReceived_(request, sender, sendResponse) {
    if (request['report']) {
      let report = new ClientRequest().setUrl(String(request['url']));
      if (request['screenshotUrl']) {
        report.setScreenshot(
            getIntArrayFromDataUrl(String(request['screenshotUrl'])));
      }
      if (request['domContent']) {
        report.setDom(String(request['domContent']));
      }
      const referrerChain =
          /** @type {!Array<!chrome.safeBrowsingPrivate.ReferrerChainEntry>} */
          (request['referrer']);
      if (referrerChain) {
        referrerChain.forEach((entry) => {
          report.addReferrerChain(parseReferrerEntry(entry));
        });
      }
      this.submitReport_(report, API_URL);
    }
  }

  /**
   * Initializes the extension background page.
   */
  init() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      const requestReceived = /** @type {!Object<string, *>} */ (request);
      this.onMessageReceived_(requestReceived, sender, sendResponse);
    });

    chrome.extension.onConnect.addListener((port) => {
      port.onMessage.addListener((message) => {
        port.postMessage({siteInfo: this.alerts});
      });
    });

    alerts.setTopSitesList();

    /**
     * Sets the browser action and icon for a tab.
     * @param {!Tab} tab A Chrome Tab instance.
     */
    const setBrowserActionAndIcon = (tab) => {
      if (!tab.url || !tab.url.startsWith('http')) {
        chrome.browserAction.disable(tab.id);
      } else {
        chrome.browserAction.enable(tab.id);
        this.getAlertBadge_(tab);
      }
    };
    chrome.tabs.query({active:true}, (tabs) => {
      tabs.forEach((tab) => {
        setBrowserActionAndIcon(tab);
      });
    });
    chrome.tabs.onActivated.addListener((activeTabInfo) => {
      chrome.tabs.get(activeTabInfo.tabId, (tab) => {
        setBrowserActionAndIcon(tab);
      });
    });
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (tab.active && (changeInfo.url || changeInfo.status)) {
        setBrowserActionAndIcon(tab);
      }
    });
  }
}

exports = Background;
