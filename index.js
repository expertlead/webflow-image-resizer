const Webflow = require('webflow-api');
const Jimp = require('jimp');
const AWS = require('aws-sdk');
const probe = require('probe-image-size');
const s3 = new AWS.S3();
require('dotenv').config();

const limit = 10; //controls amount of items per collection to process
const sizingRegEx = /(\d{1,4})x(\d{1,4})/gm;

function Resizer(config) {
    this.config = config;
    this.webflow = new Webflow({ token: this.config.webflow.token });
}

Resizer.prototype.onResizeSite = function (siteId) {
    console.log(this.config)
    const collections = this.webflow.collections({ siteId: siteId })

    collections.then(collections => {
        collections.forEach(collection => this.checkCollection(collection))
    })
}

Resizer.prototype.checkCollection = function(collection) {
    const collectionToCheck = this.webflow.collection({ collectionId: collection._id })

    collectionToCheck
        .then(
            c => {
            c.fields.forEach(field => {
                if (field.type === "ImageRef") {
                    if (field.helpText.match(sizingRegEx) !== null) {
                        this.getAllItems(collection, field)
                    } else {
                        console.log(`Help text for "${field.name}" has no sizing information. Collection: ${collection.name}`);
                    }
                }
            }
            )
        }
    );
};

Resizer.prototype.getAllItems = function(collection, field) {
    let collectionId = collection._id;
    const allItems = this.webflow.items({ collectionId: collectionId }, { limit: limit });

    allItems.then(allItems => {
        this.processItems(allItems.items, collectionId, field);
        console.log(`### Processing ${allItems.items.length} Items from ${collectionId}`);
    })
}

//Processes all items in collection
Resizer.prototype.processItems = function(items, collectionId, field) {
    items.forEach((item) => {
        let size = field.helpText.match(sizingRegEx);
        let imgSize = size[0].split('x');

        let itemDetails = {
            'collectionId': collectionId,
            'itemId': item._id,
            'itemName': item.name,
            'itemSlug': item.slug,
            'imageUrl': item[`${field.slug}`].url,
            'fieldName': field.slug,
            'fieldId': field.id,
            'width': imgSize[0] == 0 ? Jimp.AUTO : Number(imgSize[0]),
            'height': imgSize[1] == 0 ? Jimp.AUTO : Number(imgSize[1])
        }

        if(itemDetails.height !== itemDetails.width) {
        probe(item[`${field.slug}`].url)
            .then(result => {
                if (result.width > itemDetails.width || result.height > itemDetails.height) {
                    this.changeSize(itemDetails)
                } else {
                    console.log(`Skipping "${item._id}". Item already resized`)
                }
            });
        } else {
            console.log('Height and Width cannot both be set to 0 in help text')
        }
    });
}

Resizer.prototype.changeSize = function(itemDetails) {
    Jimp.read(itemDetails.imageUrl)
        .then(image => {
            return image
                .scaleToFit(itemDetails.width, itemDetails.height) // resize
                .quality(100) // set JPEG quality     
                .getBufferAsync(Jimp.MIME_JPEG)
        })
        .then(img => {
            this.uploadToAws(img, itemDetails);
        })
        .catch(err => {
            console.error(err);
        });
};

Resizer.prototype.uploadToAws = function(img, itemDetails) {
    let myBucket = this.config.aws.bucket;
    let myKey = `${itemDetails.itemId}-${itemDetails.fieldId}.jpg`;
    let params = { Bucket: myBucket, Key: myKey, Body: img };

    s3.putObject(params, function (err, data) {
        if (err) {
            console.log('error during upload to s3', err)
        }
    })
    this.updateWebflow(itemDetails)
}

Resizer.prototype.updateWebflow = function(itemDetails) {
    let url = `https://s3.${this.config.aws.region}.amazonaws.com/${this.config.aws.bucket}/${itemDetails.itemId}-${itemDetails.fieldId}.jpg`;
    let field = `${itemDetails.fieldName}`;
    let fieldsObject = {
        collectionId: itemDetails.collectionId,
        itemId: itemDetails.itemId,
        fields: {
            'name': itemDetails.itemName,
            'slug': itemDetails.itemSlug,
            '_archived': false,
            '_draft': false,
        }
    }

    fieldsObject.fields[field] = url;

    const item = this.webflow.updateItem(fieldsObject)
        .catch(err => {
            console.log(err);
        });

    item.then(i => console.log(`Updated ${field} of '${itemDetails.itemName}' in Collection: '${itemDetails.collectionId}'`))
}

exports.default = Resizer;
module.exports = exports['default'];
