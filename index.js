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
let dirCurrent = ''
let countByStep = 0
let countByResponse = 0
let currentFlow = null
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
        console.info(`count:${countByResponse}:${url}`)
        const status = response.status()
        if(status == 200){
            let ext = mime.extension(response.headers["content-type"])
            if(ext === "png"){
                return
            }
            if(ext === "jpeg"){
                return
            }
            if(ext === "jpg"){
                return
            }
            if(ext === "gif"){
                return
            }
            if(ext === "woff2"){
                return
            }
            fs.appendFileSync(`${dirNameByHttp}/${countByResponse}.json`, JSON.stringify(await response.headers()))
        } else {
            fs.appendFileSync(`${dirNameByHttp}/${countByResponse}.httperror.json`, JSON.stringify(await response.headers()))
        }
    } catch(e) {
        console.info("/----------------------------------")
        console.info("--- error                       ---")
        console.info("-----------------------------------")
        console.error(e)
        console.info("-----------------------------------")
        console.info("----------------------------------/")
        fs.appendFileSync(`${dirNameByHttp}/${countByResponse}.error.txt`, JSON.stringify(e));
    }
})
page.on('error', (e) => {
    console.info("/----------------------------------")
    console.info("--- error                       ---")
    console.info("-----------------------------------")
    console.error('error', e)
    console.info("-----------------------------------")
    console.info("----------------------------------/")
    fs.appendFileSync(`${dirNameByHttp}/${countByResponse}.error.txt`, JSON.stringify(e));
})
page.on('pageerror', (e) => {
    console.info("/----------------------------------")
    console.info("--- pageerror                   ---")
    console.info("-----------------------------------")
    console.error('pageerror', e)
    console.info("-----------------------------------")
    console.info("----------------------------------/")
    fs.appendFileSync(`${dirNameByHttp}/${countByResponse}.error.txt`, JSON.stringify(e));
})
page.on('console', msg => {
    const type = msg.type();
    if(type === 'error'){
        console.info("/----------------------------------")
        console.info("--- console                     ---")
        console.info("-----------------------------------")
        for (let i = 0; i < msg.args.length; ++i){
            console.error(`${i}: ${msg.args[i]}`)
        }
        console.info("-----------------------------------")
        console.info("----------------------------------/")
    }
})
class Extension extends PuppeteerRunnerExtension {

    async beforeAllSteps(flow) {
        currentFlow = flow
        await super.beforeAllSteps(flow)
        console.info('starting',flow)
        countByStep = 0
        countByResponse = 0
        dirCurrent = `${dirNameByResult}/${currentPlay}`
        dirNameByScreenshot = `${dirCurrent}/screenshots`
        fs.mkdirsSync(dirNameByScreenshot)
        dirNameByHttp = `${dirCurrent}/http`
        fs.mkdirsSync(dirNameByHttp)
    }

    async beforeEachStep(step, flow) {
        await super.beforeEachStep(step, flow)
        console.info('before', step)
        countByStep++
        if (step.selectors) {
            const selector = step.selectors[step.selectors.length-1]
            // await page.waitForTimeout(100)
            try{
                await page.waitForSelector(selector, { timeout: 5000 })
                fs.appendFileSync(`${dirCurrent}/result.log`, `OK , ${countByStep}/${currentFlow.steps.length} , ${step.selectors[0]} , ${selector} \n`);
            }
            catch(e){
                fs.appendFileSync(`${dirCurrent}/result.log`, `NG , ${countByStep}/${currentFlow.steps.length} , ${step.selectors[0]} , ${selector} \n`);
                console.info("/----------------------------------")
                console.info("--- 例外発生                     ---")
                console.info("-----------------------------------")
                console.info("--- Exception")
                console.error(e)
                console.info("--- step")
                console.error(step)
                for (let index = 0; index < step.selectors.length; index++) {
                    console.info(`--- step.selectors[${index}]`)
                    console.error(step.selectors[index])
                }
                console.info("--- flow")
                console.error(flow)
                for (let index = 0; index < flow.steps.length; index++) {
                    console.info(`--- flow.steps[${index}]`)
                    console.error(flow.steps[index])
                }
                console.info("-----------------------------------")
                console.info("----------------------------------/")
                fs.appendFileSync(`${dirCurrent}/error.json`, JSON.stringify(e));
            }
        }else{
            fs.appendFileSync(`${dirCurrent}/result.log`, `OK , ${countByStep}/${currentFlow.steps.length} ,\n`);
        }
    }

    async afterEachStep(step, flow) {
        await super.afterEachStep(step, flow)
        console.info('after', step)

        if(0 < countByStep){
            const fullName = `${dirNameByScreenshot}/${countByStep}.png`
            await page.screenshot({path: fullName}); 
        }
    }

    async afterAllSteps(flow) {
        await super.afterAllSteps(flow)
        console.info('done',flow)
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
        try{
            await runner.run()
        } catch(e) {
            console.info("/----------------------------------")
            console.info("--- 例外発生                     ---")
            console.info("-----------------------------------")
            console.info("--- Exception")
            console.error(e)
            console.info("----------------------------------/")
            fs.appendFileSync(`${dirNameByHttp}/${countByResponse}.error.txt`, JSON.stringify(e));
        }
    }
}

await run(new Extension(browser, page, 60000))
await browser.close()

