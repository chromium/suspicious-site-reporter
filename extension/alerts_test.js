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
        {
          url:
              'http://very-very-long-subdomain.many.many.subdomains.example.com'
        },
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

  describe('hasLongSubdomains', () => {
    it('should return true when site has unusually long subdomains', () => {
      expect(alerts.hasLongSubdomains('very-very-long-subdomain.example.co.uk'))
          .toEqual(true);
      expect(alerts.hasLongSubdomains(
                 'very.com.very-very-long-subdomain.example.com'))
          .toEqual(true);
    });

    it('should return false when site does not have unusually long subdomains',
       () => {
         expect(alerts.hasLongSubdomains('short-subdomain.example.co.uk'))
             .toEqual(false);
       });
  });

  describe('hasManySubdomains', () => {
    it('should return true when site has unusually many subdomains', () => {
      expect(alerts.hasManySubdomains('many.many.many.subdomains.co.uk'))
          .toEqual(true);
      expect(alerts.hasManySubdomains('many.many.many.subdomains.com'))
          .toEqual(true);
    });

    it('should return false when site does not have unusually many subdomains',
       () => {
         expect(alerts.hasManySubdomains('not-many.subdomains.co.uk'))
             .toEqual(false);
         expect(alerts.hasManySubdomains('not-many.subdomains.com'))
             .toEqual(false);
       });
  });

  describe('hasMultipleUrlShortenerRedirects', () => {
    it('should return true when the site has more than one redirect through a URL shortener',
       () => {
         const redirectUrls = new Set([
           'http://goo.gl/test', 'https://goo.gl/test',
           'https://goo.gl/redirect-test'
         ]);
         expect(alerts.hasMultipleUrlShortenerRedirects(redirectUrls))
             .toEqual(true);
       });

    it('should return false when the site has one redirect through a URL shortener',
       () => {
         const redirectUrls = new Set([
           'http://goo.gl/test', 'https://goo.gl/test',
           'https://redirect-test.com'
         ]);
         expect(alerts.hasMultipleUrlShortenerRedirects(redirectUrls))
             .toEqual(false);
       });
  });

  describe('redirectsThroughSuspiciousTld', () => {
    it('should return true when redirects through a suspicious TLD', () => {
      const redirectUrls = new Set(['https://test.stream', 'https://test.com']);
      expect(alerts.redirectsThroughSuspiciousTld(redirectUrls)).toEqual(true);
    });

    it('should return false when the site does not redirect through a suspicious TLD',
       () => {
         const redirectUrls = new Set(['http://test.com', 'https://test.com']);
         expect(alerts.redirectsThroughSuspiciousTld(redirectUrls))
             .toEqual(false);
       });
  });

  describe('fetchRedirectUrls', () => {
    it('should return client and server redirect URLs from the referrer',
       (done) => {
         chrome.safeBrowsingPrivate = {
           getReferrerChain: jasmine.createSpy(),
         };
         chrome.safeBrowsingPrivate.getReferrerChain.and.callFake(
             (tabId, callback) => {
               callback([
                 {
                   urlType: 'CLIENT_REDIRECT',
                   referrerUrl: 'test.com',
                   serverRedirectChain: [
                     {url: 'url-shortener.test'}, {url: 'redirect-test.com'}
                   ],
                 },
                 {
                   urlType: 'LANDING_PAGE',
                   referrerUrl: 'test.com',
                 },
               ]);
             });

         alerts.fetchRedirectUrls('redirect-test.com', /* tabId= */ 123)
             .then((response) => {
               expect(response.size).toEqual(3);
               expect(response).toEqual(new Set(
                   ['test.com', 'url-shortener.test', 'redirect-test.com']));
               done();
             });
       });
  });

  describe('computeAlerts', () => {
    // For this test case, the redirect and top site alerts will fire
    // due to mock setup complexity, while the remaining alerts trigger as
    // expected based on the URL passed into the computeAlerts function
    // and setup in the beforeEach at the top of this file.
    it('should return the correct list of alerts', async (done) => {
      alerts
          .computeAlerts(
              'http://very-very-long-subdomain.many.many.subdomains.example.com',
              /* tabId= */ 123)
          .then((response) => {
            expect(response.length).toEqual(3);
            expect(response).toContain(alerts.ALERT_MESSAGES['longSubdomains']);
            expect(response).toContain(alerts.ALERT_MESSAGES['notTopSite']);
            expect(response).toContain(alerts.ALERT_MESSAGES['manySubdomains']);
          });

      alerts
          .computeAlerts(
              'http://new-few-very-long-subdomain.example.com',
              /* tabId= */ 123)
          .then((response) => {
            expect(response.length).toEqual(3);
            expect(response).toContain(alerts.ALERT_MESSAGES['longSubdomains']);
            expect(response).toContain(alerts.ALERT_MESSAGES['notTopSite']);
            expect(response).toContain(
                alerts.ALERT_MESSAGES['notVisitedBefore']);
          });

      done();
    });
  });
});
