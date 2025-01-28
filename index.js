"use strict";

const {
    default: makeWASocket,
    makeInMemoryStore,
    DisconnectReason,
    useMultiFileAuthState,
    PHONENUMBER_MCC,
    generateWAMessageFromContent,
    makeCacheableSignalKeyStore,
    Mimetype
} = require("@whiskeysockets/baileys");
const {
    Boom
} = require('@hapi/boom');
const figlet = require("figlet");
const fs = require("fs");
const moment = require('moment');
const chalk = require('chalk');
const logger = require('pino');
const clui = require('clui');
const path = require("path");
const { Spinner } = clui;
const { serialize } = require("./lib/myfunc");
const { color, mylog, infolog } = require("./lib/color");
const axios = require('axios');
const dotenv = require('dotenv'); // Tambahkan dotenv
const util = require('util'); // Untuk menggunakan setTimeout versi Promise
const setTimeoutPromise = util.promisify(setTimeout); // Membuat setTimeout versi Promise

// Google Generative AI
const { GoogleGenerativeAI } = require("@google/generative-ai"); 

dotenv.config(); // Memuat variabel dari file .env

const time = moment(new Date()).format('HH:mm:ss DD/MM/YYYY');

const store = makeInMemoryStore({
    logger: logger().child({
        level: 'silent',
        stream: 'store'
    })
});

const readlineConfig = {
    input: process.stdin,
    output: process.stdout
};

const readline = require('readline');
const rl = readline.createInterface(readlineConfig);

const startWhatsApp = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_multi');
    const conn = makeWASocket({
        auth: state,
        logger: logger({ level: 'silent' }),
        printQRInTerminal: true,
    });

    conn.nexona = conn.nexona || {};

    conn.ev.on('connection.update', (update) => {
        if (global.qr !== update.qr) {
            global.qr = update.qr;
        }
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut ? startWhatsApp() : console.log('connection logged out...');
        }
    });

    conn.ev.on('creds.update', saveCreds);

    function title() {
        console.clear();
        console.log(chalk.bold.green(figlet.textSync('Bot Nexona', {
            font: 'Standard',
            horizontalLayout: 'default',
            verticalLayout: 'default',
            width: 80,
            whitespaceBreak: false
        })));
        console.log(chalk.yellow(`\n                      ${chalk.yellow('[ Created By Nexona ]')}\n\n${chalk.red('WhatsApp Bot')} : ${chalk.white('Nexona AI')}\n`));
    }

    function nocache(module, cb = () => { }) {
        fs.watchFile(require.resolve(module), async () => {
            await uncache(require.resolve(module));
            cb(module);
        });
    }

    function uncache(module = '.') {
        return new Promise((resolve, reject) => {
            try {
                delete require.cache[require.resolve(module)];
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }

    const status = new Spinner(chalk.cyan(` Booting WhatsApp Bot`));
    const starting = new Spinner(chalk.cyan(` Preparing After Connect`));
    const reconnect = new Spinner(chalk.redBright(` Reconnecting WhatsApp Bot`));

    title();

    require('./lib/myfunc');
    require('./message/msg');
    nocache('./lib/myfunc', module => console.log(chalk.greenBright('[ WHATSAPP BOT ]  ') + time + chalk.cyanBright(` "${module}" Telah diupdate!`)));
    nocache('./message/msg', module => console.log(chalk.greenBright('[ WHATSAPP BOT ]  ') + time + chalk.cyanBright(` "${module}" Telah diupdate!`)));

    conn.multi = true;
    conn.nopref = false;

    conn.ev.on('messages.upsert', async m => {
        if (!m.messages) return;
        var msg = m.messages[0];
        try { if (msg.message.messageContextInfo) delete msg.message.messageContextInfo } catch { }
        msg = serialize(conn, msg);
        msg.isBaileys = msg.key.id.startsWith('BAE5');
        require('./message/msg')(conn, msg, m);
    });

    conn.reply = (from, content, msg) => conn.sendMessage(from, { text: content }, { quoted: msg });

    conn.sendMessageFromContent = async (jid, message, options = {}) => {
        var option = { contextInfo: {}, ...options };
        var prepare = await generateWAMessageFromContent(jid, message, option);
        await conn.relayMessage(jid, prepare.message, { messageId: prepare.key.id });
        return prepare;
    };

    // Inisialisasi Google Generative AI
    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
    });
    const generationConfig = {
        temperature: 1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
        responseMimeType: "text/plain",
    };

    // Fungsi untuk memanggil API Gemini AI
    const callGeminiAI = async (text) => {
        try {
            const chatSession = model.startChat({
                generationConfig,
                history: [],
            });
            const result = await chatSession.sendMessage(text);
            return result.response.text();
        } catch (error) {
            console.error('Error calling Gemini AI:', error);
            return 'Error processing your request';
        }
    };

    // Event listener for messages
    conn.ev.on('messages.upsert', async m => {
        if (!m.messages) return;
        var msg = m.messages[0];
        try { if (msg.message.messageContextInfo) delete msg.message.messageContextInfo } catch { }
        msg = serialize(conn, msg);
        msg.isBaileys = msg.key.id.startsWith('BAE5');
        // Call Gemini AI for message processing
        const aiResponse = await callGeminiAI(msg.message.conversation);
        const time = moment(new Date()).format('HH:mm:ss DD/MM/YYYY');
        const aiResponseWithFlag = `${aiResponse} | ai: true`; // Tambahkan label "ai: true" di samping waktu pesan
        await setTimeoutPromise(3000); // Tambahkan delay 3 detik
        conn.reply(msg.key.remoteJid, `[${time}] ${aiResponseWithFlag}`, msg);
    });

    return conn;
};

startWhatsApp().catch(e => console.log(e));
