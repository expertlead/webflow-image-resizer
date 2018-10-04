const Webflow = require('webflow-api');
const Jimp = require('jimp');
const AWS = require('aws-sdk');
const probe = require('probe-image-size');
const s3 = new AWS.S3();
require('dotenv').config();

const limit = 100; //controls amount of items per collection to process (max: 100)
const sizingRegEx = /(\d{1,4})x(\d{1,4})/gm;
let failedCounter = 0;
let processedItems = 0;

function Resizer(config) {
    this.config = config;
    this.webflow = new Webflow({ token: this.config.webflow.token });
}

Resizer.prototype.onResizeSite = function (siteId) {
    const collections = this.webflow.collections({ siteId: siteId })

    return collections.then(collections => {
        return collections.forEach(collection => {return this.checkCollection(collection)})
    })
        .finally(res => { console.log(res, failedCounter) })
}

Resizer.prototype.checkCollection = function (collection) {
    const collectionToCheck = this.webflow.collection({ collectionId: collection._id })

    return collectionToCheck
        .then(
            c => {
                c.fields.forEach(field => {
                    if (field.type === "ImageRef") {
                        if (field.helpText.match(sizingRegEx) !== null) {
                            return this.getAllItems(collection, field)
                        } else {
                            console.log(`Help text for "${field.name}" has no sizing information. Collection: ${collection.name}`);
                        }
                    }
                }
                )
            }
        );
};

Resizer.prototype.getAllItems = function (collection, field) {
    let collectionId = collection._id;
    const allItems = this.webflow.items({ collectionId: collectionId }, { limit: limit });

    return allItems.then(allItems => {
        console.log(`### Processing ${allItems.items.length} Items from ${collectionId}`);
        return this.processItems(allItems.items, collectionId, field);
    })
}

//Processes all items in collection
Resizer.prototype.processItems = function (items, collectionId, field) {
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
            'width': Number(imgSize[0]),
            'height': Number(imgSize[1])
        }

        if (itemDetails.height !== 0 && itemDetails.width !== 0) {
            return probe(item[`${field.slug}`].url)
                .then(result => {
                    if (result.width > itemDetails.width || result.height > itemDetails.height) {
                        return this.changeSize(itemDetails)
                    } else {
                        console.log(`Skipping "${item._id}". Item already resized`)
                    }
                });
        } else {
            console.log('Height and Width cannot set to 0 in help text')
        }
    });
}

Resizer.prototype.changeSize = function (itemDetails) {
    return Jimp.read(itemDetails.imageUrl)
        .then(image => {
            return image
                .scaleToFit(itemDetails.width, itemDetails.height) // resize
                .quality(100) // set JPEG quality     
                .getBufferAsync(Jimp.MIME_JPEG)
        })
        .then(img => {
            return this.uploadToAws(img, itemDetails);
        })
        .catch(err => {
            console.error(err);
            failedCounter++;
        });
};

Resizer.prototype.uploadToAws = function (img, itemDetails) {
    let myBucket = this.config.aws.bucket;
    let myKey = `${itemDetails.itemId}-${itemDetails.fieldId}.jpg`;
    let params = { Bucket: myBucket, Key: myKey, Body: img };

    return s3.putObject(params, function (err, data) {
        if (err) {
            // todo: throw error exception
            console.log('error during upload to s3', err)
            failedCounter++;
        }
    }).promise().then(
        res => {
            // todo: check response
            return this.updateWebflow(itemDetails)
        }
    )
}

Resizer.prototype.updateWebflow = function (itemDetails) {
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
            failedCounter++;
        });

    return item.then(i => console.log(`Updated ${field} of '${itemDetails.itemName}' in Collection: '${itemDetails.collectionId}'`))
}

exports.default = Resizer;
module.exports = exports['default'];
