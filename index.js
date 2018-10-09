const Webflow = require('webflow-api');
const Jimp = require('jimp');
const AWS = require('aws-sdk');
const probe = require('probe-image-size');
require('dotenv').config();

const limit = 2; //controls amount of items per collection to process (max: 100)
const sizingRegEx = /(\d{1,4})x(\d{1,4})/gm;

function Resizer(config) {
    this.config = config;
    this.s3 = new AWS.S3({ region: config.aws.region });
    this.webflow = new Webflow({ token: this.config.webflow.token });
}

Resizer.prototype.onResizeSite = function (siteId) {
    const collections = this.webflow.collections({ siteId: siteId })

    return collections.then(collections => {
        var fetchPromises = []
        collections.forEach(collection => {
            fetchPromises.push(
                this.webflow.collection({ collectionId: collection._id })
            )
        })

        return fetchPromises
    }).then(collectionFetchPromises => {
        return Promise.all(collectionFetchPromises).then(
            collections => {
                return collections
            }
        )
    }).then(
        collections => {
            collectionsWithImagesFields = []
            collections.forEach(c => {
                var imagesFields = this.getImagesFieldsFromCollection(c);
                if (0 !== imagesFields.length) {
                    collectionsWithImagesFields.push({
                        collectionId: c._id,
                        fields: imagesFields
                    })
                }
            })

            return collectionsWithImagesFields;
        }
    ).then(
        collectionsFieldsWithImages => {
            var fetchItemsPromises = []
            collectionsFieldsWithImages.forEach(collectionFields => {
                this.getAllItems(collectionFields)
                    .then(
                        collectionItems => {
                            collectionItems.fields = collectionFields.fields
                            return this.processItems(collectionItems)
                        }
                    )
            })

            return fetchItemsPromises
        }
    ).then(
        processedItems => {
            return Promise.all(processedItems).then(
                itemsImages => {
                    return itemsImages;
                }
            )
        }
    ).then(
        processedCollections => {
            var flattenedItems = []
            processedCollections.forEach(collectionItems => {
                collectionItems.forEach(item => {
                    flattenedItems.push(item)
                })
            })

            return flattenedItems;
        }
    ).then(
        flattenedItems => {
            var validationSizes = []
            flattenedItems.forEach(
                item => {
                    validationSizes.push(this.validateImageSize(item))
                }
            )

            return validationSizes;
        }
    ).then(
        validatedItemsPromises => {
            return Promise.all(validatedItemsPromises).then(
                validatedItems => {
                    return validatedItems.filter(n => n)
                }
            )
        }
    ).then(
        filteredItems => {
            if (0 === filteredItems.length) {
                return 0;
            } else {
                var sizeChangePromises = [];
                filteredItems.forEach(
                    filteredItem => {
                        sizeChangePromises.push(this.changeSize(filteredItem))
                    }
                )

                return sizeChangePromises
            }
        }
    )
}

Resizer.prototype.getAllItems = function (collection) {
    let itemsArr = [];

    this.webflow.items({ collectionId: collection.collectionId }, { limit: limit })
        .then(items => {
            let runs = Math.floor(items.total / limit);
            let offset = items.offset;
            for (i = 1; i <= runs; i++) {
                itemsArr.push(this.webflow.items(
                    { collectionId: collection.collectionId },
                    { limit: limit },
                    { offset: offset * [i] }
                )
                )
            }
            console.log(itemsArr)
            return itemsArr;
        })
}

Resizer.prototype.getImagesFieldsFromCollection = function (collection) {
    var imagesFields = [];
    for (var i = 0; i < collection.fields.length; i++) {
        if (collection.fields[i].type === "ImageRef" &&
            collection.fields[i].helpText.match(sizingRegEx) !== null) {
            imagesFields.push(collection.fields[i]);
        }
    }

    return imagesFields;
}

//Processes all items in collection
Resizer.prototype.processItems = function (collectionItems) {
    var itemsImages = []
    collectionItems.fields.forEach((field) => {
        collectionItems.items.forEach((item) => {
            let size = field.helpText.match(sizingRegEx);
            let imgSize = size[0].split('x');
            let itemDetails = {
                'collectionId': item._cid,
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
                itemsImages.push(itemDetails)
            }
        })
    });

    return itemsImages
}

Resizer.prototype.validateImageSize = function (itemDetails) {
    if (itemDetails.height !== 0 && itemDetails.width !== 0) {
        return probe(itemDetails.imageUrl)
            .then(
                result => {
                    if (result.width > itemDetails.width || result.height > itemDetails.height) {
                        return itemDetails;
                    } else {
                        return null
                    }
                }
            );
    }
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
            console.error(
                'error scaling the image',
                err,
                itemDetails
            );
        });
};

Resizer.prototype.uploadToAws = function (img, itemDetails) {
    let myBucket = this.config.aws.bucket;
    let myKey = `${itemDetails.itemId}-${itemDetails.fieldId}.jpg`;
    let params = { Bucket: myBucket, Key: myKey, Body: img };

    return this.s3.putObject(params, function (err, data) {
        if (err) {
            console.error(
                'error during upload to s3',
                err,
                itemDetails
            )
        }
    }).promise().then(
        res => {
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
            console.error(err, itemDetails);
        });

    return item.then(i => console.log(`Updated ${field} of '${itemDetails.itemName}' in Collection: '${itemDetails.collectionId}'`))
}

exports.default = Resizer;
module.exports = exports['default'];
