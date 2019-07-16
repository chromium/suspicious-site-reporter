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
 * @fileoverview Unit tests for alerts.js.
 */

goog.module('suspiciousSiteReporter.alerts.test');
goog.setTestOnly();

const alerts = goog.require('suspiciousSiteReporter.alerts');

describe('alerts', () => {
  beforeEach(() => {
    chrome.history = {
      search: jasmine.createSpy(),
    };

    jasmine.clock().mockDate(new Date(2019, 0, 1));
    chrome.history.search.and.callFake((details, callback) => {
      callback([
        {url: 'http://visitedyesterday.test/page1'},
        {url: 'http://visitedthreemonthsago.test/page1'},
      ]);
    });
  });

  describe('isIDN', () => {
    it('should return false when site does not use an IDN', () => {
      expect(alerts.isIDN('not-idn.com')).toEqual(false);
      expect(alerts.isIDN('some-xn--com')).toEqual(false);
      expect(alerts.isIDN('test.some-xn--com')).toEqual(false);
      expect(alerts.isIDN('test.com/xn--v8j0cwa6g')).toEqual(false);
    });

    it('should return true when site uses an IDN', () => {
      // Uses ひらがな.com, which should be encoded before getting
      // passed into this function.
      expect(alerts.isIDN('xn--v8j0cwa6g.com/')).toEqual(true);
      expect(alerts.isIDN('test.xn--v8j0cwa6g.com/')).toEqual(true);
      expect(alerts.isIDN('xn--v8j0cwa6g.com')).toEqual(true);
      expect(alerts.isIDN('test.xn--com')).toEqual(true);
    });
  });

  // These tests assume that chrome.history.search is getting called with the
  // correct arguments.
  describe('visitedBeforeToday', () => {
    it('should return false when site visited for the first time today',
       (done) => {
         alerts.visitedBeforeToday('visitedtoday.test').then((response) => {
           expect(response).toEqual(false);
           done();
         });
       });

    it('should return false when site visited over six months ago', (done) => {
      alerts.visitedBeforeToday('visitedoneyearago.test').then((response) => {
        expect(response).toEqual(false);
        done();
      });
    });

    it('should return true when site visited yesterday', (done) => {
      alerts.visitedBeforeToday('visitedyesterday.test').then((response) => {
        expect(response).toEqual(true);
        done();
      });
    });

    it('should return true when site visited three months ago', (done) => {
      alerts.visitedBeforeToday('visitedthreemonthsago.test')
          .then((response) => {
            expect(response).toEqual(true);
            done();
          });
    });

    it('should return true when the user has no browsing history', (done) => {
      chrome.history.search = jasmine.createSpy();
      chrome.history.search.and.callFake((details, callback) => {
        callback([]);
      });
      alerts.visitedBeforeToday('').then((response) => {
        expect(response).toEqual(true);
        done();
      });
    });
  });

  describe('computeAlerts', () => {
    it('should return the correct list of alerts', async (done) => {
      alerts.computeAlerts('http://visitedyesterday.test').then((response) => {
        expect(response.length).toEqual(1);
      });

      alerts.computeAlerts('http://visitedtoday.test').then((response) => {
        expect(response.length).toEqual(2);
        expect(response).toContain(alerts.ALERT_MESSAGES['notVisitedBefore']);
      });

      alerts.computeAlerts('http://many.many.subdomains.test').then((response) => {
        expect(response.length).toEqual(3);
	expect(response).toContain(alerts.ALERT_MESSAGES['manySubdomains']);
      });

      alerts.computeAlerts('http://not-many.subdomains.co.uk').then((response) => {
        expect(response.length).toEqual(3);
        expect(response).not.toContain(alerts.ALERT_MESSAGES['manySubdomains']);
      });

      done();
    });
  });
});
