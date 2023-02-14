#!/usr/bin/env node
const yargs = require('yargs/yargs')
const {
    hideBin
} = require('yargs/helpers')
const fs = require('fs');
const axios = require('axios')
const inquirer = require('inquirer');
const path = require('path');
const parser = require('xml2json');
const dir = path.resolve(path.join(__dirname, '.config'));
const geolib = require('geolib');

const HAMQTH_TOKEN_EXPIRE_MINUTES = 60



const get = (p, o) => {
    if (!Array.isArray(p)) p = p.split('.');
    return p.reduce((xs, x) =>
        (xs && typeof xs[x] !== 'undefined') ? xs[x] : null, o);
};



const getSavedCredentials = async (credentials) => {
    if (!credentials) {
        credentials = JSON.parse(fs.readFileSync(path.join(dir, 'lcall.json')));
    }
    if (credentials.token && (credentials.tokenExpire > Date.now())) {
        return credentials;
    }
    let login = await axios.get(`https://www.hamqth.com/xml.php?u=${credentials.login}&p=${credentials.password}`);
    let loginJson = JSON.parse(parser.toJson(login.data));
    let token = get('HamQTH.session.session_id', loginJson);
    if (!token) {
        console.log('Login failed. Please check your login/password.')
        process.exit(1);
    }
    credentials.token = token
    credentials.tokenExpire = Date.now() + (HAMQTH_TOKEN_EXPIRE_MINUTES * 60 * 1000);
    
    let resultJson = await getQTHRecord(credentials.token, credentials.login)
    credentials.latitude = get('HamQTH.search.latitude', resultJson);
    credentials.longitude = get('HamQTH.search.longitude', resultJson);

    fs.writeFileSync(path.join(dir, 'lcall.json'), JSON.stringify(credentials));
    return credentials;
}


const getQTHRecord = async (token, call) => {
    let result = await axios.get(`https://www.hamqth.com/xml.php?id=${token}&callsign=${call}&prg=w1adv-lookup-tool`);
    let resultJson = JSON.parse(parser.toJson(result.data));
    return resultJson;
}

const login = async () => {
    const answers = await inquirer.prompt(
        [{
                message: 'HamQTH login:',
                name: 'login',
                type: 'string'
            },
            {
                message: 'HamQTH password:',
                name: 'password',
                type: 'string'
            }
        ]);


    if (!fs.existsSync(dir)) {
        await fs.mkdirSync(dir);
    }

    await getSavedCredentials(answers);    

    console.log(`Login/password saved.`);
};



const lookup = async () => {
    if (!fs.existsSync(dir)) {
        console.log(`No login/password saved. Please login first.`)
        process.exit(1);
    }
    if (!fs.existsSync(path.join(dir, 'lcall.json'))) {
        console.log(`No login/password saved. Please login first.`)
        process.exit(1);
    }

    let call = hideBin(process.argv)[1].trim();

    let creds = await getSavedCredentials();
    let resultJson = await getQTHRecord(creds.token, call)

    let callsign = get('HamQTH.search.callsign', resultJson);
    if (!callsign) {
        console.log(`No record found for ${call}`);
        process.exit(1)
    }
    callsign = callsign.toUpperCase()
    const state = get('HamQTH.search.us_state', resultJson);
    const city = get('HamQTH.search.adr_city', resultJson)
    let country = get('HamQTH.search.adr_country', resultJson)
    if (country == 'Unknown') country = get('HamQTH.search.country', resultJson)
    const name = get('HamQTH.search.adr_name', resultJson) || get('HamQTH.search.nick', resultJson)
    const distance = Math.round(geolib.getDistance({
        latitude: Number(creds.latitude),
        longitude: Number(creds.longitude)
    }, {
        latitude: Number(get('HamQTH.search.latitude', resultJson)),
        longitude: Number(get('HamQTH.search.longitude', resultJson))
    }) / 1000)
    const distanceMi = Math.round(distance * 0.621371)
    //console.log(JSON.stringify(resultJson, null, 2))

    let result = []
    
    result.push(country)
    result.push(name)
    if (city && JSON.stringify(city) !== '{}') result.push(city)
    if (state) result.push(state)
    result.push(`${distance}km/${distanceMi}mi away`)

    console.log(`${callsign}: ${result.join(' - ')}`)
}


const argv = yargs(hideBin(process.argv))
    .command('login', 'Login to QTH', () => {}, login)
    .command('lookup <call>', 'Lookup a callsign', (yargs) => {
        return yargs.positional('call', {
            describe: 'callsign to look up'
        })
    }, lookup)
    .demandCommand(1, 1, 'choose a command: login or lookup')
    .strict()
    .parse()