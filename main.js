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
                token: "7b690b88e3e151ff6b2dec81d9df55da9f0312895afc398a1078776555d25397"
            }
        }
    )

    resizerInstance.onResizeSite(siteId)
}
