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
 * @fileoverview Unit tests for popup.js.
 */

goog.module('suspiciousSiteReporter.popupTest');
goog.setTestOnly();

const Popup = goog.require('suspiciousSiteReporter.Popup');

describe('Popup', () => {
  let popup, mainElement, confirmationElement, errorElement;

  beforeEach(() => {
    chrome.tabs = {
      query: jasmine.createSpy(),
      captureVisibleTab: jasmine.createSpy(),
      executeScript: jasmine.createSpy(),
    };
    chrome.runtime = {};
    chrome.runtime.onMessage = {
      addListener: jasmine.createSpy(),
    };

    popup = new Popup();

    // Add elements from popup.html
    const main = document.createElement('div');
    main.id = 'main';
    main.style.display = 'block';
    document.body.appendChild(main);
    const reportButton = document.createElement('button');
    reportButton.id = 'report-site';
    document.body.appendChild(reportButton);
    const confirmation = document.createElement('div');
    confirmation.id = 'confirmation';
    document.body.appendChild(confirmation);
    const error = document.createElement('div');
    error.id = 'error';
    document.body.appendChild(error);
    const closeButton = document.createElement('button');
    closeButton.id = 'close-button';
    closeButton.classList.add('close-button');
    document.body.appendChild(closeButton);
    const siteInfo = document.createElement('div');
    siteInfo.id = 'site-info';
    document.body.appendChild(siteInfo);
    const url = document.createElement('span');
    url.id = 'url-preview';
    document.body.appendChild(url);
    const detail = document.createElement('a');
    detail.id = 'detail';
    detail.classList.add('preview-link');
    document.body.appendChild(detail);
    const progress = document.createElement('div');
    progress.id = 'progress';
    document.body.appendChild(progress);

    mainElement = document.getElementById('main');
    confirmationElement = document.getElementById('confirmation');
    errorElement = document.getElementById('error');
  });

  it('should close on close button press', () => {
    spyOn(window, 'close');
    popup.init();
    document.getElementById('close-button').click();
    expect(window.close).toHaveBeenCalled();
  });

  it('should show confirmation page on success', () => {
    chrome.runtime.onMessage.addListener.and.callFake((callback) => {
      callback({'success': true});
    });
    popup.init();
    expect(mainElement.style.display).toEqual('none');
    expect(confirmationElement.style.display).toEqual('block');
  });

  it('should show error page on error', () => {
    chrome.runtime.onMessage.addListener.and.callFake((callback) => {
      callback({'error': true});
    });
    popup.init();
    expect(mainElement.style.display).toEqual('none');
    expect(errorElement.style.display).toEqual('block');
  });

  describe('data preview', () => {
    beforeEach(() => {
      chrome.tabs.query.and.callFake((queryInfo, callback) => {
        callback([{url: 'http://username:password@www.example.test/'}]);
      });
      spyOn(popup, 'populateAlerts_');
      spyOn(popup, 'generateScreenshotPreview_');
      spyOn(popup, 'retrieveDom_');
      spyOn(popup, 'generateReferrerChainPreview_');
      spyOn(popup, 'generateErrorBubble_');
    });

    it('should be generated', () => {
      popup.init();
      expect(popup.populateAlerts_).toHaveBeenCalled();
      expect(popup.generateScreenshotPreview_).toHaveBeenCalled();
      expect(popup.retrieveDom_).toHaveBeenCalled();
      expect(popup.generateReferrerChainPreview_).toHaveBeenCalled();
    });

    it('should remove user info from the URL', () => {
      popup.init();
      expect(document.getElementById('url-preview').textContent)
          .toEqual('http://www.example.test/');
    });

    it('should be hidden on click outside of the preview', () => {
      spyOn(popup, 'hideOnOutsideClick_');
      popup.init();
      const detailElement = document.getElementById('detail');
      detailElement.click();
      expect(detailElement.classList).toContain('shown-preview');
      mainElement.click();
      expect(detailElement.classList).not.toContain('shown-preview');
      expect(popup.hideOnOutsideClick_).toHaveBeenCalled();
    });
  });
});
