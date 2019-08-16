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
 * @fileoverview Script for extension popup. Handles display of page alerts,
 * user form options, and triggering submit button.
 */

goog.module('suspiciousSiteReporter.Popup');

const alerts = goog.require('suspiciousSiteReporter.alerts');
const {assertInstanceof} = goog.require('goog.asserts');

/**
 * Removes user credentials from the URL.
 * @param {string} url The URL of the page.
 * @return {string} The URL with credentials removed.
 * @private
 */
const removeUserInfo = (url) => {
  let parsedUrl = new URL(url);
  parsedUrl.username = '';
  parsedUrl.password = '';
  return parsedUrl.toString();
};

/**
 * Returns whether an element's text requires multiple lines.
 * @param {?HTMLElement} element The element containing the text.
 * @return {boolean} Whether the text is more than one line long.
 */
const isMultiline = (element) => {
  return element.scrollWidth > element.offsetWidth;
};

class Popup {
  constructor() {
    /** @private {?string} A data URL representing a screenshot. */
    this.screenshotUrl_ = null;
    /** @private {?string} A string representing the DOM of a page. */
    this.domContent_ = null;
    /**
     * @private {!Array<!chrome.safeBrowsingPrivate.ReferrerChainEntry>} A list
     *     of referrer chain entries.
     */
    this.referrer_ = [];
  }

  /**
   * Handles event listeners for hiding previews when clicking outside of them.
   * @param {!Event} event A DOM event.
   * @param {!Element} preview The element containing a detail preview.
   * @private
   */
  hideOnOutsideClick_(event, preview) {
    const hidePreviewListener = (event) => {
      if (!preview.contains(event.target) &&
          preview.classList.contains('shown-preview')) {
        preview.classList.remove('shown-preview');
        window.removeEventListener('click', hidePreviewListener);
      }
    };
    preview.classList.add('shown-preview');
    window.addEventListener('click', hidePreviewListener);
  }

  /**
   * Generates an element to show a preview of a screenshot of the current tab.
   * @param {!Tab} tab A Chrome Tab instance.
   * @private
   */
  generateScreenshotPreview_(tab) {
    const popup = this;
    chrome.tabs.captureVisibleTab(
        tab.windowId, {format: 'png'}, (screenshotUrl) => {
          if (screenshotUrl) {
            popup.screenshotUrl_ = screenshotUrl;
            let element = new Image();
            element.src = screenshotUrl;
            element.classList.add('preview');
            document.getElementById('screenshot-preview').appendChild(element);
          } else {
            const errorMsg =
                `The security settings on this page prevent screenshots from
                being taken.`;
            popup.generateErrorBubble_(
                document.getElementById('screenshot'),
                document.getElementById('screenshot-preview'), errorMsg);
          }
        });
  }

  /**
   * Injects content script to request DOM content.
   * @param {number} tabId The ID of the active tab.
   * @param {?Object<string, boolean>} sendDom Message object with boolean
   *     indicating whether to fetch DOM.
   * @param {function(?)} callback Callback for remaining report content.
   * @private
   */
  getDomContent_(tabId, sendDom, callback) {
    chrome.tabs.executeScript(tabId, {file: 'content_bin.js'}, () => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
      }
      chrome.tabs.sendMessage(tabId, sendDom, callback);
    });
  }

  /**
   * Retrieves the HTML of the current tab and handles scripting errors.
   * @param {!Tab} tab A Chrome Tab instance.
   * @private
   */
  retrieveDom_(tab) {
    const popup = this;
    this.getDomContent_(tab.id, {'sendDom': true}, (domContent) => {
      if (domContent) {
        popup.domContent_ = domContent;
        document.getElementById('dom-preview-container').innerHTML =
            'DOM Content';
      } else {
        const errorMsg =
            `The security settings on this page prevent us from retrieving the
            DOM.`;
        popup.generateErrorBubble_(
            document.getElementById('dom'),
            document.getElementById('dom-preview'), errorMsg);
      }
    });
  }

  /**
   * Generates an element to show a preview of the URLs in the referrer chain.
   * @param {!Tab} tab A Chrome Tab instance.
   * @private
   */
  generateReferrerChainPreview_(tab) {
    const popup = this;
    const referrerPreview = document.getElementById('referrer-preview');

    const generateReferrerError = (errorMsg) => {
      document.getElementById('referrer-urls').style.display = 'none';
      popup.generateErrorBubble_(
          document.getElementById('referrer'), referrerPreview, errorMsg);
    };

    if (chrome.safeBrowsingPrivate &&
        chrome.safeBrowsingPrivate.getReferrerChain) {
      chrome.safeBrowsingPrivate.getReferrerChain(tab.id, (referrer) => {
        popup.referrer_ = referrer;
        const referrerUrls = new Set([]);
        referrer.forEach((referrerEntry) => {
          referrerUrls.add(referrerEntry.url);
          if (referrerEntry.mainFrameUrl) {
            referrerUrls.add(referrerEntry.mainFrameUrl);
          }
          if (referrerEntry.referrerUrl) {
            referrerUrls.add(referrerEntry.referrerUrl);
          }
          if (referrerEntry.referrerMainFrameUrl) {
            referrerUrls.add(referrerEntry.referrerMainFrameUrl);
          }
          if (referrerEntry.serverRedirectChain) {
            referrerEntry.serverRedirectChain.forEach((redirect) => {
              referrerUrls.add(redirect.url);
            });
          }
        });
        if (referrerUrls.size > 0) {
          popup.populateList_(
              document.getElementById('referrer-urls'), referrerUrls,
              ['referrer-url', 'truncated']);
          const urls = document.getElementsByClassName('referrer-url');
          const previewContainer =
              assertInstanceof(referrerPreview.parentNode, HTMLElement);
          previewContainer.classList.add('shown-preview');
          for (let url of urls) {
            url = assertInstanceof(url, HTMLElement);
            if (isMultiline(url)) url.classList.add('multiline');
            url.addEventListener('click', (event) => {
              url.classList.toggle('truncated');
            });
          }
          previewContainer.classList.remove('shown-preview');
        } else {
          generateReferrerError(`No referrer found`);
        }
      });
    } else {
      generateReferrerError(
          `The referrer chain API is not available. Please check that your
            Chrome version is up to date.`);
    }
  }

  /**
   * Disables a checkbox and generates an explanatory error bubble.
   * @param {?Element} checkboxInput The element that contains the checkbox.
   * @param {?Element} previewElement The element that contains the preview.
   * @param {string} errorMsg The error message to show in the bubble.
   *     bubble.
   * @private
   */
  generateErrorBubble_(checkboxInput, previewElement, errorMsg) {
    const input = assertInstanceof(checkboxInput, HTMLInputElement);
    input.checked = false;
    input.disabled = true;
    input.nextElementSibling.classList.add('disabled-unchecked-checkbox');
    let element = document.createElement('p');
    element.textContent = errorMsg;
    element.classList.add('error-info');
    previewElement.appendChild(element);
    previewElement.parentElement.style.color = '#669df6';
  }

  /**
   * Populates an list element with the provided list items.
   * @param {?Element} listElement The HTML Element to populate.
   * @param {!Iterable<string>} items The text content to put in the list.
   * @param {!Array<string>} classes Class names to add to each list item.
   * @private
   */
  populateList_(listElement, items, classes) {
    if (!listElement) return;
    for (let item of items) {
      const node = document.createElement('li');
      const textNode = document.createTextNode(item);
      node.appendChild(textNode);
      node.classList.add(...classes);
      listElement.appendChild(node);
    }
  }

  /**
   * Sends message that report button has been clicked on the popup.
   * @private
   */
  sendReport_() {
    const screenshotInput = assertInstanceof(
        document.getElementById('screenshot'), HTMLInputElement);
    const screenshotUrl =
        screenshotInput.checked ? this.screenshotUrl_ : undefined;
    const domInput =
        assertInstanceof(document.getElementById('dom'), HTMLInputElement);
    const domContent = domInput.checked ? this.domContent_ : undefined;
    const referrerInput =
        assertInstanceof(document.getElementById('referrer'), HTMLInputElement);
    const referrer = referrerInput.checked ? this.referrer_ : undefined;
    chrome.runtime.sendMessage({
      'report': true,
      'url': document.getElementById('url-preview').textContent,
      'screenshotUrl': screenshotUrl,
      'domContent': domContent,
      'referrer': referrer,
    });
    document.getElementById('progress').style.display = 'block';
  }

  /**
   * Populates alert list.
   * @param {string} url The URL of the current tab.
   * @private
   */
  populateAlerts_(url) {
    let port = chrome.extension.connect({name: 'Site info'});
    port.postMessage({siteInfo: true});
    port.onMessage.addListener(async (message) => {
      let fetchedAlerts = message.siteInfo;
      // If we failed to obtain a cached list of alerts from the
      // background page, recompute the alert list now.
      if (!fetchedAlerts) {
        alerts.setTopSitesList();
        const computedAlerts = await alerts.computeAlerts(url);
        fetchedAlerts = computedAlerts;
      }
      if (!fetchedAlerts || fetchedAlerts.length === 0) {
        let element = document.createElement('li');
        element.textContent = fetchedAlerts ?
            'Nothing detected' :
            'Error fetching signals. Refresh page to view.';
        element.classList.add('site-info-alert', 'no-alerts');
        document.getElementById('site-info').appendChild(element);
        return;
      }
      this.populateList_(
          document.getElementById('alerts'), fetchedAlerts,
          ['site-info-alert']);
    });
  }

  /**
   * Initializes the extension popup.
   */
  init() {
    document.getElementById('progress').style.display = 'none';

    document.getElementById('report-site')
        .addEventListener('click', (event) => {
          this.sendReport_();
        });

    const closeButtons = document.getElementsByClassName('close-button');
    for (let button of closeButtons) {
      button.addEventListener('click', (event) => {
        window.close();
      });
    }

    const urlPreview =
        assertInstanceof(document.getElementById('url-preview'), HTMLElement);
    urlPreview.addEventListener('click', (event) => {
      urlPreview.classList.toggle('truncated');
    });

    const previews = document.getElementsByClassName('preview-link');
    for (let preview of previews) {
      preview.addEventListener('click', (event) => {
        this.hideOnOutsideClick_(event, preview);
      });
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      document.getElementById('main').style.display = 'none';
      if (request['success']) {
        document.getElementById('confirmation').style.display = 'block';
      } else if (request['error']) {
        document.getElementById('error').style.display = 'block';
      }
    });

    const popup = this;
    chrome.tabs.query({'active': true, 'currentWindow': true}, (tabs) => {
      const currentTab = tabs[0];
      popup.populateAlerts_(currentTab.url);
      urlPreview.textContent = removeUserInfo(currentTab.url);
      if (isMultiline(urlPreview)) urlPreview.classList.add('multiline');
      popup.generateScreenshotPreview_(currentTab);
      popup.retrieveDom_(currentTab);
      popup.generateReferrerChainPreview_(currentTab);
    });
  }
}

exports = Popup;
