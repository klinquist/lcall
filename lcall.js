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

const HAMQTH_TOKEN_EXPIRE_MINUTES = 60



const get = (p, o) => {
    if (!Array.isArray(p)) p = p.split('.');
    return p.reduce((xs, x) =>
        (xs && typeof xs[x] !== 'undefined') ? xs[x] : null, o);
};



const getToken = async (credentials) => {
    if (!credentials) {
        credentials = JSON.parse(fs.readFileSync(path.join(dir, 'lcall.json')));
    }
    if (credentials.token && credentials.tokenExpire > new Date().getTime()) {
        return credentials.token;
    }
    console.log('Getting new HamQTH token...')
    let login = await axios.get(`https://www.hamqth.com/xml.php?u=${credentials.login}&p=${credentials.password}`);
    let loginJson = JSON.parse(parser.toJson(login.data));
    let token = get('HamQTH.session.session_id', loginJson);
    if (!token) {
        console.log('Login failed. Please check your login/password.')
        process.exit(1);
    }
    credentials.token = token
    credentials.tokenExpire = new Date().getTime() + HAMQTH_TOKEN_EXPIRE_MINUTES*60*60*1000;
    fs.writeFileSync(path.join(dir, 'lcall.json'), JSON.stringify(credentials));
    return token;
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

    await getToken(answers);    

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
    let token = await getToken();
    let result = await axios.get(`https://www.hamqth.com/xml.php?id=${token}&callsign=${call}&prg=w1adv-lookup-tool`);
    let resultJson = JSON.parse(parser.toJson(result.data));
    
    let callsign = get('HamQTH.search.callsign', resultJson);
    if (!callsign) {
        console.log(`No record found for ${call}`);
        process.exit(1)
    }
    callsign = callsign.toUpperCase()
    const state = get('HamQTH.search.us_state', resultJson);
    const city = get('HamQTH.search.adr_city', resultJson)
    const country = get('HamQTH.search.adr_country', resultJson)
    const name = get('HamQTH.search.adr_name', resultJson) || get('HamQTH.search.nick', resultJson)
    if (state) {
        console.log(`${callsign}: ${country} - ${name} - ${city}, ${state}`)
    } else {
        console.log(`${callsign}: ${country} - ${name} - ${city}`)
    }
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