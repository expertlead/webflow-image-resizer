# webflow-image-resizer

[![Build Status](https://travis-ci.com/expertlead/webflow-image-resizer.svg?branch=master)](https://travis-ci.com/expertlead/webflow-image-resizer)

## about

Resize images in the WebFlow CMS based on predefined size in help field

## how to install

```bash
$ npm i --save webflow-image-resizer
```

## required env variables

In order to be able to persist the exported images in S3, you have to export these env variables:
- **AWS_ACCESS_KEY_ID** Access key ID
- **AWS_SECRET_ACCESS_KEY** Secret access key

## how to use

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
        }
    }
);
```
