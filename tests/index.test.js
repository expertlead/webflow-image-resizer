const Resizer = require('../index.js');
const testCollection = require('./testCollection.json');
const testItems = require('./testItems.json');
const testItemDetails = require('./testItemDetails.json');
const resizer = new Resizer({
    aws: {
        region: 'eu-central-1',
        bucket: 'thumbnail-expertlead-com'
    },
    webflow: {
        token: '7b690b88e3e151ff6b2dec81d9df55da9f0312895afc398a1078776555d25397'
    }
});

resizer.s3 = {
    putObject: (data, db) => {
        return {}
    }
}

test("getImagesFieldsFromCollection function exists", () => {
    expect(resizer.getImagesFieldsFromCollection).toBeDefined();
});

test("processItems function exists", () => {
    expect(resizer.processItems).toBeDefined();
});

test('getImagesFieldsFromCollections returns array of fields', () => {
    const getImagesFieldsFromCollection = resizer.getImagesFieldsFromCollection(testCollection);
    expect(getImagesFieldsFromCollection).toEqual([{
        "name": "Main Image",
        "slug": "main-image",
        "type": "ImageRef",
        "required": false,
        "editable": true,
        "helpText": "500x300",
        "id": "b6ed353667320c2875a1d2feb2bdf004",
        "validations": {}
    },
    {
        "name": "Thumbnail image",
        "slug": "thumbnail-image",
        "type": "ImageRef",
        "required": false,
        "editable": true,
        "helpText": "200x400",
        "id": "4071b6430eac9391a9ae39218ab5e1c4",
        "validations": {}
    }]);
})

test('processItems returns process items in an array', () => {
    const processItems = resizer.processItems(testItems);
    expect(processItems).toEqual(
        [{
            'collectionId': '5ba8b76c5ced0c0461e6900f',
            'itemId': "5bb63d9ed7637b63430e15aa",
            'itemName': "Designers Who Changed the Web",
            'itemSlug': "designers-who-changed-the-web",
            'imageUrl': "https://uploads-ssl.webflow.com/5ba8b76cfb278db77e75c002/5bb63dad95d21b2d604e6318_5bb63d9ed7637b63430e15aa-b6ed353667320c2875a1d2feb2bdf004.jpeg",
            'fieldName': "main-image",
            'fieldId': "b6ed353667320c2875a1d2feb2bdf004",
            'width': 500,
            'height': 300
        }]
    )
})

test('validateImageSize approves item (returns object of item details)', () => {
    const validateImageSize = resizer.validateImageSize(testItemDetails[0]);
    expect.assertions(1);

    return validateImageSize.then(data => {
        expect(data).not.toEqual(null);
    });
});

test('validateImageSize rejects item (returns null)', () => {
    const validateImageSize = resizer.validateImageSize(testItemDetails[1]);
    expect.assertions(1);

    return validateImageSize.then(data => {
        expect(data).toBe(null);
    });
});


