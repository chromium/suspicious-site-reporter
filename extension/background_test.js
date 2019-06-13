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
 * @fileoverview Unit tests for background.js.
 */

goog.module('suspiciousSiteReporter.backgroundTest');
goog.setTestOnly();

const Background = goog.require('suspiciousSiteReporter.Background');
const alerts = goog.require('suspiciousSiteReporter.alerts');

describe('Background', () => {
  let background;

  beforeEach(() => {
    alerts.setTopSitesList = function() {};
    chrome.runtime = {};
    chrome.runtime.onMessage = {
      addListener: jasmine.createSpy(),
    };
    chrome.extension = {};
    chrome.extension.onConnect = {
      addListener: jasmine.createSpy(),
    };
    chrome.tabs = {};
    chrome.tabs.onActivated = {
      addListener: jasmine.createSpy(),
    };
    chrome.tabs.onUpdated = {
      addListener: jasmine.createSpy(),
    };
    chrome.tabs.query = jasmine.createSpy();

    background = new Background();
  });

  it('submitReport_ gets called upon receipt of report message', () => {
    spyOn(background, 'submitReport_');
    chrome.runtime.onMessage.addListener.and.callFake((callback) => {
      callback({'report': true});
    });
    background.init();
    expect(background.submitReport_).toHaveBeenCalled();
  });
});
