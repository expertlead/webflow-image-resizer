# webflow-image-resizer

[![Build Status](https://travis-ci.com/expertlead/webflow-image-resizer.svg?branch=master)](https://travis-ci.com/expertlead/webflow-image-resizer)

## about

Resize images in the WebFlow CMS based on predefined size in your collection image help fields. Format for help field sizing "300x300" supports 1 - 4 digit numbers (see example picture below).

Images will be scaled down to fit the smallest constraint, with priority given to width. For example stating with an image 1300x860 and help text of 400x400, the result would be an image of 400x265.

Image fields without help text or images that already meet the sizing requirements will be ignored by image-resizer.

Supported types: `jpeg`, `png`, `bmp`, `tiff`, `gif`

![size-example](https://i.imgur.com/eDF1JEy.png)


## How to install

```bash
$ npm i --save webflow-image-resizer
```

## Required env variables

In order to be able to persist the exported images in S3, you have to export these env variables:
- **AWS_ACCESS_KEY_ID** Access key ID
- **AWS_SECRET_ACCESS_KEY** Secret access key

## How to use

```js
var WebflowImageResizer = require('webflow-image-resizer')
var resizer = new WebflowImageResizer(
    {
        aws: {
            region: 'eu-west-1',
            bucket: 'examplebucket'
        },
        webflow: {
            token: 'example-webflow-token'
        },
        quality: 90  //quality of image as a percentage
    }
);

resizer.onResizeSite('yourSiteIdHere')
```
