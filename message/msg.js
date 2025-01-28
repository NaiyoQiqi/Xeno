const { callGeminiAI } = require('../index'); // Import fungsi callGeminiAI
const moment = require('moment'); // Import moment untuk format waktu
const util = require('util'); // Untuk menggunakan setTimeout versi Promise
const setTimeoutPromise = util.promisify(setTimeout); // Membuat setTimeout versi Promise

module.exports = async (conn, msg, m) => {
    if (msg.message.conversation) {
        const aiResponse = await callGeminiAI(msg.message.conversation);
        const time = moment(new Date()).format('HH:mm:ss DD/MM/YYYY');
        const aiResponseWithFlag = `${aiResponse} | ai: true`; // Tambahkan label "ai: true" di samping waktu pesan
        await setTimeoutPromise(3000); // Tambahkan delay 3 detik
        await conn.reply(msg.key.remoteJid, `[${time}] ${aiResponseWithFlag}`, msg);
    }
};
