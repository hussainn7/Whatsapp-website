const fs = require('fs');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios'); // Import axios for making HTTP requests
const xml2js = require('xml2js'); // Import xml2js for XML parsing
const EventEmitter = require('events');
require('dotenv').config(); // Load environment variables

// Create global event emitter for settings updates
global.eventEmitter = new EventEmitter();

class WhatsAppBot {
    constructor(io = null) {
        this.io = io; // Socket.io instance for real-time updates
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            }
        });

        this.userData = new Map(); // Store user data
        this.countries = this.loadCountries(); // Load country list
        this.setupEventHandlers();
        this.loadSettings();

        // Listen for settings updates
        global.eventEmitter.on('settingsUpdated', (settings) => {
            console.log('Settings updated:', settings);
            this.updateSettings(settings);
        });
    }

    loadSettings() {
        try {
            const settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
            this.updateSettings(settings);
        } catch (error) {
            console.error('Error loading settings:', error);
            // Use default settings from the original code
            this.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
            this.TOURVISOR_LOGIN = process.env.TOURVISOR_LOGIN;
            this.TOURVISOR_PASS = process.env.TOURVISOR_PASS;
            this.SYSTEM_PROMPT = 'You are a helpful travel agent assistant. Provide friendly and informative responses about travel-related questions. If someone asks about booking a tour, remind them they can type "тур" to start the booking process.';
        }
    }

    updateSettings(settings) {
        this.OPENAI_API_KEY = settings.openaiApiKey || "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";
        this.TOURVISOR_LOGIN = settings.tourvisorLogin || "admotionapp@gmail.com";
        this.TOURVISOR_PASS = settings.tourvisorPass || "sjqVZ4QLNLBN5";
        this.SYSTEM_PROMPT = settings.systemPrompt || "Your name is TourAI. You are a helpful travel agent assistant. Provide friendly and informative responses about travel-related questions. If someone asks about booking a tour, remind them they can type \"тур\" to start the booking process.";
    }

    loadCountries() {
        // Define the list of countries
        return [
            { id: "46", name: "Абхазия" },
            { id: "31", name: "Австрия" },
            { id: "55", name: "Азербайджан" },
            { id: "71", name: "Албания" },
            { id: "17", name: "Андорра" },
            { id: "88", name: "Аргентина" },
            { id: "53", name: "Армения" },
            { id: "72", name: "Аруба" },
            { id: "59", name: "Бахрейн" },
            { id: "57", name: "Беларусь" },
            { id: "20", name: "Болгария" },
            { id: "39", name: "Бразилия" },
            { id: "44", name: "Великобритания" },
            { id: "37", name: "Венгрия" },
            { id: "90", name: "Венесуэла" },
            { id: "16", name: "Вьетнам" },
            { id: "38", name: "Германия" },
            { id: "6", name: "Греция" },
            { id: "54", name: "Грузия" },
            { id: "11", name: "Доминикана" },
            { id: "1", name: "Египет" },
            { id: "30", name: "Израиль" },
            { id: "3", name: "Индия" },
            { id: "7", name: "Индонезия" },
            { id: "29", name: "Иордания" },
            { id: "92", name: "Иран" },
            { id: "14", name: "Испания" },
            { id: "24", name: "Италия" },
            { id: "78", name: "Казахстан" },
            { id: "40", name: "Камбоджа" },
            { id: "79", name: "Катар" },
            { id: "51", name: "Кения" },
            { id: "15", name: "Кипр" },
            { id: "60", name: "Киргизия" },
            { id: "13", name: "Китай" },
            { id: "10", name: "Куба" },
            { id: "80", name: "Ливан" },
            { id: "27", name: "Маврикий" },
            { id: "36", name: "Малайзия" },
            { id: "8", name: "Мальдивы" },
            { id: "50", name: "Мальта" },
            { id: "23", name: "Марокко" },
            { id: "18", name: "Мексика" },
            { id: "81", name: "Мьянма" },
            { id: "82", name: "Непал" },
            { id: "9", name: "ОАЭ" },
            { id: "64", name: "Оман" },
            { id: "87", name: "Панама" },
            { id: "35", name: "Португалия" },
            { id: "47", name: "Россия" },
            { id: "93", name: "Саудовская Аравия" },
            { id: "28", name: "Сейшелы" },
            { id: "58", name: "Сербия" },
            { id: "25", name: "Сингапур" },
            { id: "43", name: "Словения" },
            { id: "2", name: "Таиланд" },
            { id: "41", name: "Танзания" },
            { id: "5", name: "Тунис" },
            { id: "4", name: "Турция" },
            { id: "56", name: "Узбекистан" },
            { id: "26", name: "Филиппины" },
            { id: "34", name: "Финляндия" },
            { id: "32", name: "Франция" },
            { id: "22", name: "Хорватия" },
            { id: "21", name: "Черногория" },
            { id: "19", name: "Чехия" },
            { id: "52", name: "Швейцария" },
            { id: "12", name: "Шри-Ланка" },
            { id: "69", name: "Эстония" },
            { id: "70", name: "Южная Корея" },
            { id: "33", name: "Ямайка" },
            { id: "49", name: "Япония" }
        ];
    }

    setupEventHandlers() {
        // QR Code generation (only needed for first-time setup)
        this.client.on('qr', (qr) => {
            qrcode.generate(qr, { small: true });
            console.log('QR Code generated. Please scan with WhatsApp!');
            
            // If we have Socket.io, emit the QR code to the admin panel
            if (this.io) {
                // Generate a PNG data URL from the QR code
                const qrCodeLibrary = require('qrcode');
                qrCodeLibrary.toDataURL(qr, (err, url) => {
                    if (err) {
                        console.error('Error generating QR code data URL:', err);
                        return;
                    }
                    this.io.emit('qrCode', url);
                });
            }
        });

        // Ready event
        this.client.on('ready', () => {
            console.log('WhatsApp bot is ready!');
            // Notify the admin panel that the bot is ready
            if (this.io) {
                this.io.emit('botStatus', { status: 'ready' });
            }
        });

        // Message handling
        this.client.on('message', async (msg) => {
            if (msg.fromMe) return; // Ignore messages from the bot itself
            await this.handleMessage(msg);
        });

        // Authentication failed event
        this.client.on('auth_failure', (msg) => {
            console.error('Authentication failed:', msg);
            if (this.io) {
                this.io.emit('botStatus', { status: 'auth_failure', message: msg });
            }
        });

        // Disconnected event
        this.client.on('disconnected', (reason) => {
            console.log('Client was disconnected:', reason);
            if (this.io) {
                this.io.emit('botStatus', { status: 'disconnected', reason });
            }
        });
    }

    async handleMessage(msg) {
        const userId = msg.from;
        console.log(`📩 Received message from user ${userId}: '${msg.body}'`);

        if (!this.userData.has(userId)) {
            this.userData.set(userId, {
                isSearching: false,
                awaitingDeparture: false,
                awaitingCountry: false,
                awaitingNights: false,
                awaitingAdults: false,
                awaitingChildren: false,
                departure: null,
                country: null,
                nights: null,
                adults: null,
                children: null
            });
            await this.safeSendMessage(msg, '👋 Здравствуйте! Я ваш турагент-помощник. Я могу помочь вам найти подходящий тур или ответить на ваши вопросы о путешествиях.\n\nЧтобы начать поиск тура, просто напишите "тур".');
            return;
        }

        const userParams = this.userData.get(userId);

        if (msg.body.toLowerCase() === 'тур') {
            userParams.isSearching = true;
            userParams.awaitingDeparture = true;
            await this.safeSendMessage(msg, '🏙️ Из какого города вы хотите вылететь?');
            return;
        }

        if (userParams.isSearching) {
            await this.handleTourSearch(msg, userParams);
        } else {
            const response = await this.getChatGPTResponse(msg.body);
            await this.safeSendMessage(msg, response);
        }
    }

    async handleTourSearch(msg, userParams) {
        try {
            if (userParams.awaitingDeparture) {
                userParams.departure = msg.body; // Store the city name
                userParams.awaitingDeparture = false;
                userParams.awaitingCountry = true;
                await this.askCountry(msg);
            } else if (userParams.awaitingCountry) {
                const cityName = msg.body.trim();
                const countryId = await this.getCountryIdFromCity(cityName);
                if (countryId) {
                    userParams.country = countryId; // Store the country ID
                    userParams.awaitingCountry = false;
                    userParams.awaitingNights = true;
                    await this.askNights(msg);
                } else {
                    await this.safeSendMessage(msg, '😔 Не удалось распознать страну по городу. Пожалуйста, попробуйте снова или введите страну.');
                }
            } else if (userParams.awaitingNights) {
                const nights = msg.body.split('-').map(Number);
                if (nights.length === 2) {
                    userParams.nights = nights; // Store as an array [nightsFrom, nightsTo]
                    userParams.awaitingNights = false;
                    userParams.awaitingAdults = true;
                    await this.askAdults(msg);
                } else {
                    await this.safeSendMessage(msg, 'Пожалуйста, введите количество ночей в формате "X-Y", например "7-14".');
                }
            } else if (userParams.awaitingAdults) {
                userParams.adults = msg.body;
                userParams.awaitingAdults = false;
                userParams.awaitingChildren = true;
                await this.askChildren(msg);
            } else if (userParams.awaitingChildren) {
                userParams.children = msg.body;
                userParams.awaitingChildren = false;
                await this.confirmSearch(msg, userParams);
            }
        } catch (error) {
            console.error('Error in handleTourSearch:', error);
            await this.safeSendMessage(msg, 'Произошла ошибка. Пожалуйста, напишите "тур" для начала поиска заново.');
            this.resetUserState(msg.from);
        }
    }

    async confirmSearch(msg, userParams) {
        console.log(`Starting search with the following parameters:`);
        console.log(`Departure: ${userParams.departure}`); // This is the city name
        console.log(`Country ID: ${userParams.country}`); // This should be the country ID
        console.log(`Nights: ${userParams.nights.join('-')}`);
        console.log(`Adults: ${userParams.adults}`);
        console.log(`Children: ${userParams.children}`);

        await this.safeSendMessage(msg, 'Хорошо, начинаем поиск...');

        // Proceed to start the tour search
        const requestId = await this.startTourSearch(msg, userParams);
        if (requestId) {
            await this.getSearchResults(requestId, msg); // Directly get results
        }
    }

    async formatSearchRequest(userParams) {
        const today = new Date();
        const dateFrom = new Date(today);
        dateFrom.setDate(today.getDate() + 1);
        const dateTo = new Date(today);
        dateTo.setDate(today.getDate() + 30);

        const formattedDateFrom = `${dateFrom.getDate().toString().padStart(2, '0')}.${(dateFrom.getMonth() + 1).toString().padStart(2, '0')}.${dateFrom.getFullYear()}`;
        const formattedDateTo = `${dateTo.getDate().toString().padStart(2, '0')}.${(dateTo.getMonth() + 1).toString().padStart(2, '0')}.${dateTo.getFullYear()}`;

        return `http://tourvisor.ru/xml/search.php?authlogin=${this.TOURVISOR_LOGIN}&authpass=${this.TOURVISOR_PASS}&departure=${userParams.country}&country=${userParams.country}&datefrom=${formattedDateFrom}&dateto=${formattedDateTo}&nightsfrom=${userParams.nights[0]}&nightsto=${userParams.nights[1]}&adults=${userParams.adults}&child=${userParams.children}&format=xml`;
    }

    async startTourSearch(msg, userParams) {
        const apiUrl = await this.formatSearchRequest(userParams);
        console.log(`Making API request to: ${apiUrl}`);

        try {
            const response = await axios.get(apiUrl);
            console.log(`API Response: ${response.data}`);
            const result = await this.parseApiResponse(response.data);
            return result.requestid; // Return the request ID for direct result fetching
        } catch (error) {
            console.error('Error making API request:', error);
            await this.safeSendMessage(msg, 'Произошла ошибка при отправке запроса на поиск туров.');
            return null;
        }
    }

    async getSearchResults(requestId, msg) {
        const resultsUrl = `http://tourvisor.ru/xml/result.php?authlogin=${this.TOURVISOR_LOGIN}&authpass=${this.TOURVISOR_PASS}&requestid=${requestId}&type=result`;
        console.log(`Fetching results from: ${resultsUrl}`);

        try {
            // Wait a few seconds for the search to complete
            await this.safeSendMessage(msg, '🔍 Ищем туры, это может занять несколько секунд...');
            await new Promise(resolve => setTimeout(resolve, 5000));

            const response = await axios.get(resultsUrl);
            const parser = new xml2js.Parser();
            
            const result = await new Promise((resolve, reject) => {
                parser.parseString(response.data, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });

            // Check if we have data and hotels
            if (result.data && result.data.result && result.data.result[0].hotel) {
                await this.handleResults(response.data, msg);
            } else {
                await this.safeSendMessage(msg, '🔄 Поиск все еще выполняется. Пожалуйста, повторите поиск через несколько минут, написав "тур"');
            }
        } catch (error) {
            console.error('Error fetching results:', error);
            await this.safeSendMessage(msg, '😔 Произошла ошибка при получении результатов поиска. Пожалуйста, попробуйте позже.');
        }
    }

    async handleResults(xmlData, msg) {
        const parser = new xml2js.Parser();
        parser.parseString(xmlData, async (err, result) => {
            if (err) {
                console.error('Error parsing results:', err);
                await this.safeSendMessage(msg, 'Не удалось обработать результаты поиска.');
                this.resetUserState(msg.from);
                return;
            }

            // Check if the result contains hotels
            const hotels = result.data.result[0].hotel;
            if (hotels && hotels.length > 0) {
                let responseMessage = '🏨 Найденные отели:\n';
                hotels.forEach(hotel => {
                    const hotelName = hotel.hotelname[0];
                    const price = hotel.price[0];
                    const description = hotel.hoteldescription[0];
                    const fullDescLink = hotel.fulldesclink[0];
                    const countryname = hotel.countryname[0];
                    const hotelstars = hotel.hotelstars[0];
                    // Extracting fly dates from tours
                    const tours = hotel.tours[0].tour;
                    const flydate = tours.map(tour => tour.flydate[0]).join(', ');

                    responseMessage += `\n🏨 Название: ${hotelName}\n💰 Цена: ${price} тг.\n Звезды: ${hotelstars} \nСтрана ${countryname}\n📝 Описание: ${description}\n🔗 Полное описание: http://manyhotels.ru/${fullDescLink}\n`;
                });
                await this.safeSendMessage(msg, responseMessage);
                await this.safeSendMessage(msg, 'Поиск завершен. Вы можете задать мне вопрос о путешествиях или написать "тур" для нового поиска.');
            } else {
                await this.safeSendMessage(msg, '😔 К сожалению, отели не найдены по вашему запросу. Вы можете написать "тур" для нового поиска или задать мне вопрос о путешествиях.');
            }
            
            // Reset user state after showing results
            this.resetUserState(msg.from);
        });
    }

    async parseApiResponse(xmlData) {
        const parser = new xml2js.Parser();
        return new Promise((resolve, reject) => {
            parser.parseString(xmlData, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result.result);
                }
            });
        });
    }

    async getCountryIdFromCity(cityName) {
        // Predefined mapping of cities to country IDs
        const cityCountryMap = {
            // Kazakhstan cities
            "Алматы": 78,
            "Астана": 78,
            "Шымкент": 78,
            "Караганда": 78,
            "Костанай": 78,
            "Кызылорда": 78,
            "Актау": 78,
            "Атырау": 78,
            "Павлодар": 78,
            "Усть-Каменогорск": 78,
            "Семей": 78,
            "Тараз": 78,
            "Уральск": 78,
            "Актобе": 78,

            // Turkey cities
            "Анталия": 4,
            "Стамбул": 4,
            "Бодрум": 4,
            "Мармарис": 4,
            "Алания": 4,
            "Кемер": 4,
            "Фетхие": 4,
            "Турция": 4,

            // UAE cities
            "Дубай": 9,
            "Абу-Даби": 9,
            "Шарджа": 9,
            "Рас-эль-Хайма": 9,
            "Аджман": 9,
            "ОАЭ": 9,
            "Эмираты": 9,

            // Egypt cities
            "Хургада": 1,
            "Шарм-эль-Шейх": 1,
            "Каир": 1,
            "Египет": 1,

            // Thailand cities
            "Бангкок": 2,
            "Пхукет": 2,
            "Паттайя": 2,
            "Самуи": 2,
            "Таиланд": 2,

            // Russia cities
            "Москва": 47,
            "Санкт-Петербург": 47,
            "Сочи": 47,
            "Россия": 47,

            // Common country names
            "Мальдивы": 8,
            "Греция": 6,
            "Кипр": 15,
            "Индия": 3,
            "Вьетнам": 16,
            "Шри-Ланка": 12,
            "Индонезия": 7,
            "Бали": 7,
            "Сейшелы": 28,
            "Маврикий": 27,
            "Доминикана": 11,
            "Куба": 10,
            "Израиль": 30
        };

        // Convert input to title case and trim
        const normalizedCityName = cityName.trim();

        // Check if the city is in the predefined list
        if (cityCountryMap[normalizedCityName]) {
            return cityCountryMap[normalizedCityName];
        } else {
            // If not found, use ChatGPT to find the country
            const countryId = await this.getCountryIdFromChatGPT(normalizedCityName);
            return countryId;
        }
    }

    async getCountryIdFromChatGPT(cityName) {
        const apiKey = this.OPENAI_API_KEY; // Use the hardcoded OpenAI API key
        const endpoint = 'https://api.openai.com/v1/chat/completions';

        try {
            const response = await axios.post(endpoint, {
                model: 'gpt-3.5-turbo',
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are a helpful assistant. Given a city name, provide the corresponding country ID from the predefined list.'
                    },
                    { 
                        role: 'user', 
                        content: `What is the country ID for the city: ${cityName}?`
                    }
                ],
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            });

            // Extract the country ID from the response
            const countryId = response.data.choices[0].message.content; // Adjust based on the expected response format
            return countryId;
        } catch (error) {
            console.error('Error connecting to ChatGPT:', error);
            return null; // Return null if there is an error
        }
    }

    async getChatGPTResponse(userMessage) {
        const apiKey = this.OPENAI_API_KEY;
        const endpoint = 'https://api.openai.com/v1/chat/completions';

        try {
            const response = await axios.post(endpoint, {
                model: 'gpt-3.5-turbo',
                messages: [
                    { 
                        role: 'system', 
                        content: this.SYSTEM_PROMPT // Use the dynamic system prompt
                    },
                    { 
                        role: 'user', 
                        content: userMessage 
                    }
                ],
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            });

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('Error connecting to ChatGPT:', error);
            return "🚨 Извините, произошла ошибка при обращении к ChatGPT. Проверьте ваш API ключ и попробуйте позже.";
        }
    }

    async askDeparture(msg) {
        await msg.reply('🏙️ Из какого города вы хотите вылететь?');
    }

    async askCountry(msg) {
        await msg.reply('🌍 В какую страну вы хотите поехать?');
    }

    async askNights(msg) {
        await msg.reply('⌛ На сколько ночей планируете поездку?');
    }

    async askAdults(msg) {
        await msg.reply('👥 Сколько взрослых поедет? (введите число от 1 до 6)');
    }

    async askChildren(msg) {
        await msg.reply('👶 Сколько детей поедет? (введите число от 0 до 4)');
    }

    resetUserState(userId) {
        this.userData.set(userId, {
            isSearching: false,
            awaitingDeparture: false,
            awaitingCountry: false,
            awaitingNights: false,
            awaitingAdults: false,
            awaitingChildren: false,
            departure: null,
            country: null,
            nights: null,
            adults: null,
            children: null
        });
    }

    async safeSendMessage(msg, response) {
        try {
            // Use direct message sending instead of reply
            await this.client.sendMessage(msg.from, response);
        } catch (error) {
            console.error('Error sending message:', error);
            // Try alternative method if first fails
            try {
                await msg.reply(response);
            } catch (secondError) {
                console.error('Both sending methods failed:', secondError);
            }
        }
    }

    start() {
        console.log('Starting WhatsApp bot...');
        this.client.initialize()
            .then(() => console.log('Bot initialized successfully'))
            .catch(err => console.error('Failed to initialize bot:', err));
    }
}

// Export the WhatsAppBot class for use in server.js
module.exports = { WhatsAppBot }; 