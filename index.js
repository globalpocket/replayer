import {
    createRunner,
    PuppeteerRunnerExtension,
    parse,
} from '@puppeteer/replay'
import puppeteer from 'puppeteer'
import fs from 'fs-extra'
import path from 'path'
import mime from 'mime-types'

let currentPlay = ''
const dirNameByRecordings = './recordings'
const dirNameByResult = './result'
let dirNameByScreenshot = ''
let dirNameByHttp = ''
let countByStep = 0
let countByResponse = 0
const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ja'],
    headless: false,
    slowMo: 50,
})
const page = await browser.newPage()
page.on('response',async (response)=>{
    try{
        countByResponse++

        const url = await response.url()
        console.error(`count:${countByResponse}:${url}`)
        fs.writeFileSync(`${dirNameByHttp}/${countByResponse}.url.txt`, url)

        const timing = await response.timing()
        fs.writeFileSync(`${dirNameByHttp}/${countByResponse}.timing.txt`, JSON.stringify(timing))

        const headers = await response.headers()
        fs.writeFileSync(`${dirNameByHttp}/${countByResponse}.headers.txt`, JSON.stringify(headers))

        const status = response.status()
        if(status == 200){
            const ext = mime.extension(headers["content-type"])
            const responseName = `${dirNameByHttp}/${countByResponse}.response.${ext}`
            response.buffer().then((buffer)=>{
                fs.writeFileSync(responseName, buffer)
            }).catch((e)=>{
                fs.writeFileSync(responseName, JSON.stringify(e))
            })
        } else {
            const responseName = `${dirNameByHttp}/${countByResponse}.response.txt`
            fs.writeFileSync(responseName, `STATUS CODE : ${status}`)
        }
    } catch(e) {
        console.error(e)
        fs.writeFileSync(`${dirNameByHttp}/${countByResponse}.error.txt`, JSON.stringify(e));
    }
})

class Extension extends PuppeteerRunnerExtension {

    async beforeAllSteps(flow) {
        await super.beforeAllSteps(flow)
        console.log('starting')

        countByStep = 0
        countByResponse = 0
        dirNameByScreenshot = `${dirNameByResult}/${currentPlay}/screenshots`
        fs.mkdirsSync(dirNameByScreenshot)
        dirNameByHttp = `${dirNameByResult}/${currentPlay}/http`
        fs.mkdirsSync(dirNameByHttp)
    }

    async beforeEachStep(step, flow) {
        await super.beforeEachStep(step, flow)
        console.log('before', step)

        if (step.selectors) {
            await page.waitForTimeout(3000)
            await page.waitForSelector(step.selectors[0], { timeout: 10000 })
        }
    }

    async afterEachStep(step, flow) {
        await super.afterEachStep(step, flow)
        console.log('after', step)

        if(0 < countByStep){
            const fullName = `${dirNameByScreenshot}/${countByStep}.png`
            await page.screenshot({path: fullName}); 
        }
        countByStep++
    }

    async afterAllSteps(flow) {
        await super.afterAllSteps(flow)
        console.log('done')
    }
}

export async function run(extension) {
    fs.removeSync(dirNameByResult)

    const recordings = fs
        .readdirSync(dirNameByRecordings, { withFileTypes: true })
        .filter((dirent) => dirent.isFile())
        .filter((dirent) => path.extname(dirent.name).toLowerCase() === '.json')
        .map(({ name }) => name)

    for (let index = 0; index < recordings.length; index++) {
        const recording = recordings[index];
        currentPlay = path.basename(recording,'.json')
        const jsonText = fs.readFileSync(`${dirNameByRecordings}/${recording}`, 'utf8')
        const parsed = parse(JSON.parse(jsonText))
        const runner = await createRunner(parsed, extension)
        await runner.run()
    }
}

await run(new Extension(browser, page, 60000))
await browser.close()

