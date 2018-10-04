const resizer = require('./index.js')
let siteId = "5ba8b64c9ad7872bcd1fce7f";


main2()

function main2() {
    var resizerInstance = new resizer(
        {
            aws: {
                bucket: 'thumbnails-expertlead-com',
                region: 'eu-central-1'
            },
            webflow: {
                token: WEBFLOW_TOKEN="be370b74407159e242e63e844e44f0daef965f6a8bc3e4613d2d6e60bdc1a9d5"
            }
        }
    )

    resizerInstance.onResizeSite(siteId)
}
