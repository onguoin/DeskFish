# Third-party notices

## hls.js

- Package: `hls.js` 1.6.16
- Source: https://github.com/video-dev/hls.js
- Files: `vendor/hls.min.js`, `vendor/hls.js.LICENSE`
- License: Apache License 2.0

hls.js is bundled for Media Source Extensions playback of the short-lived HLS stream produced by the DeskFish local Huya proxy. It replaces Edge's native HLS path, which can reject valid Huya timestamp discontinuities. The full license text is included beside the bundled script.

## Free-book API integrations

- Project Gutenberg official OPDS catalog: https://www.gutenberg.org/ebooks/search.opds/
- Chinese Wikisource MediaWiki API: https://zh.wikisource.org/w/api.php
- English Wikisource MediaWiki API: https://en.wikisource.org/w/api.php
- Qidian public search/catalog/chapter pages (through the bundled local parser): https://m.qidian.com/
- Open-source behavior reference: https://github.com/cis-india/wikisource-reader

DeskFish independently implements the catalog, MediaWiki, text normalization, and chapter-offset clients. It does not bundle books from these services. Content is requested only after a user searches or selects a work and is then stored in that user's Edge profile. The source work's public-domain or free-license terms remain applicable.

## Warrior – Sword Out

- Creator: jpneok
- Source: https://openclipart.org/detail/102229/warrior-sword-out
- Asset: `assets/warrior-openclipart.svg`
- License: Public domain through Openclipart

The asset is recolored, cropped, and composited with original DeskFish artwork and typography for the browser ad-window cover.

## zip.js

- Package: `@zip.js/zip.js` 2.8.60
- Source: https://github.com/gildas-lormeau/zip.js
- Files: `vendor/zip.min.js`, `vendor/zip.js.LICENSE`
- License: BSD 3-Clause

zip.js is used to read local CBZ/ZIP files and OPDS-acquired comic archives page by page. The full license text is included beside the bundled script.

## Komiic integration reference

- Service: https://komiic.com
- Open-source API reference: https://github.com/miru-project/repo/blob/main/repo/komiic.com.js
- Reference license: MIT

DeskFish contains independently implemented browser and local-host clients and does not bundle source code from the reference project. Comic images remain hosted and served by Komiic.

## Baozi manga-source integration reference

- Service: https://www.baozimh.com
- Open-source behavior reference: https://github.com/miru-project/repo/blob/main/repo/baozimh.com.js
- Reference project: https://github.com/miru-project/repo
- Reference license: MIT

DeskFish's Windows host contains an independently adapted C# source connector based on the public behavior documented by the reference. It performs requests only when the user searches or opens a chapter; it does not bundle or redistribute comic pages.

## YY manga-source integration reference

- Service: https://www.yymanhua.com
- Open-source behavior reference: https://github.com/miru-project/repo/blob/main/repo/yymanhua.com.js
- Reference project: https://github.com/miru-project/repo
- Reference license: MIT

DeskFish contains an independently adapted C# connector for search, chapter catalogs, and the site's packed image response. It does not bundle or redistribute comic pages.

MIT License

Copyright (c) 2023 miru-project

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
