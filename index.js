const Webflow = require('webflow-api');
const Jimp = require('jimp');
const AWS = require('aws-sdk');
const probe = require('probe-image-size');
require('dotenv').config();

const limit = 100; //controls amount of items per collection to process (max: 100)
const sizingRegEx = /(\d{1,4})x(\d{1,4})/gm;

function Resizer(config) {
    this.config = config;
    this.s3 = new AWS.S3({region: config.aws.region});
    this.webflow = new Webflow({token: config.webflow.token});
}

Resizer.prototype.onResizeSite = function (siteId) {
    const collections = this.webflow.collections({siteId: siteId})
    console.log(`siteId is ${siteId}`)

    return collections.then(collections => {
        var fetchPromises = []
        collections.forEach(collection => {
            fetchPromises.push(
                this.webflow.collection({collectionId: collection._id})
            )
            console.log(`Getting items from collection ${collection._id}`)
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
                console.log(`checking for image fields in ${c._id}`)
                var imagesFields = this.getImagesFieldsFromCollection(c);
                if (0 !== imagesFields.length) {
                    var requiredFields = this.getRequiredFieldsFromCollection(c);
                    collectionsWithImagesFields.push({
                        collectionId: c._id,
                        fields: imagesFields,
                        requiredFields: requiredFields
                    })
                }
            })
            return collectionsWithImagesFields;
        }
    ).then(
        collectionsFieldsWithImages => {
            var processedItemsPromises = [];
            collectionsFieldsWithImages.forEach(collectionFields => {
                processedItemsPromises.push(
                    this.getAllItems(collectionFields)
                        .then(
                            collectionItems => {
                                console.log(`processing ${collectionItems.length} items`)
                                collectionItems = collectionItems.map(page => {
                                    page.fields = collectionFields.fields
                                    page.requiredFields = collectionFields.requiredFields
                                    return this.processItems(page);
                                })
                                return collectionItems
                            }
                        )
                )
            })
            return processedItemsPromises
        }
    ).then(
        processedItemsPromises => {
            return Promise.all(processedItemsPromises).then(
                processedItems => {
                    return processedItems[0]
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
                        console.log(`resizing ${filteredItem}`)
                        sizeChangePromises.push(this.changeSize(filteredItem))
                    }
                )

                return sizeChangePromises
            }
        }
    )
}

Resizer.prototype.getAllItems = function (collection) {
    let itemsPromises = [];

    return this.webflow.items({collectionId: collection.collectionId}, {limit: limit})
        .then(res => {
            itemsPromises.push(res);
            if (res.total > res.limit) {
                let runs = Math.ceil(res.total / limit);
                for (i = 1; i < runs; i++) {
                    itemsPromises.push(this.webflow.items(
                        {collectionId: collection.collectionId},
                        {limit: limit, offset: limit * i},
                        )
                    )
                }
            }
            return Promise.all(itemsPromises);
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

Resizer.prototype.getRequiredFieldsFromCollection = function (collection) {
    var requiredFields = [];
    for (var i = 0; i < collection.fields.length; i++) {
        if (collection.fields[i].required === true) {
            requiredFields.push(collection.fields[i]);
        }
    }

    return requiredFields;
}

//Processes all items in collection
Resizer.prototype.processItems = function (collectionItems) {
    var itemsImages = []
    collectionItems.fields.forEach((field) => {
        collectionItems.items.forEach((item) => {
            if (item[`${field.slug}`]) {
                let size = field.helpText.match(sizingRegEx);
                let imgSize = size[0].split('x');

                let requiredFields = collectionItems.requiredFields.map(field => {
                    return {fieldName: field.slug, fieldValue: item[field.slug]}
                })

                let itemDetails = {
                    'collectionId': item._cid,
                    'itemId': item._id,
                    'itemName': item.name,
                    'itemSlug': item.slug,
                    'imageUrl': item[`${field.slug}`].url,
                    'fieldName': field.slug,
                    'fieldId': field.id,
                    'width': Number(imgSize[0]),
                    'height': Number(imgSize[1]),
                    'requiredFields': requiredFields
                }
                if (itemDetails.height !== 0 && itemDetails.width !== 0) {
                    itemsImages.push(itemDetails)
                }
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
                .quality(this.config.quality) // set JPEG quality     
                .getBufferAsync(Jimp.MIME_JPEG)
        })
        .then(img => {
            return this.uploadToAws(img, itemDetails);
        })
        .catch(err => {
            console.log(
                'error scaling the image',
                err,
                itemDetails
            );
        });
};

Resizer.prototype.uploadToAws = function (img, itemDetails) {
    let myBucket = this.config.aws.bucket;
    let myKey = `${itemDetails.itemId}-${itemDetails.fieldId}.jpg`;
    let params = {Bucket: myBucket, Key: myKey, Body: img};

    return this.s3.putObject(params, function (err, data) {
        if (err) {
            console.log(
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
        fields: {}
    }

    fieldsObject.fields[field] = url;

    itemDetails.requiredFields.forEach(field => {
        fieldsObject.fields[field.fieldName] = field.fieldValue;
    })

    const item = this.webflow.updateItem(fieldsObject)
        .catch(err => {
            console.log(err, itemDetails);
        });

    return item.then(i => console.log(`Updated ${field} of '${itemDetails.itemName}' in Collection: '${itemDetails.collectionId}'`))
}

exports.default = Resizer;
module.exports = exports['default'];
