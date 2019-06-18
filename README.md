# Suspicious Site Reporter

Made by Google Chrome extension.

Suspicious Site Reporter is available [at the webstore](https://chrome.google.com/webstore/detail/suspicious-site-reporter/jknemblkbdhdcpllfgbfekkdciegfboi).

With the Suspicious Site Reporter extension, you’ll see an icon when you’re on a
potentially suspicious site, and more information about why the site is
suspicious. Click the icon to report unsafe sites to Google Safe Browsing for
further evaluation.

## Building

Most users should be able to use the version of the extension in the Chrome
Web Store, but you may also compile the extension yourself by running the
following from the `extension/` directory:

```
./do.sh install_deps
./do.sh build
```

You may then load the unpacked extension from `extension/build/extension`.

Note that if extension is built from here instead of using the version on the
webstore, the private referrer chain API will be unavailable.
