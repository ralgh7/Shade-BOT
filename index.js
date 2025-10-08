// Import necessary libraries
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

// Get credentials from environment variables
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const BUYER_ROLE_ID = process.env.BUYER_ROLE_ID;

// KeyAuth Credentials
const KEYAUTH_OWNER_ID = process.env.KEYAUTH_OWNER_ID;
const KEYAUTH_APP_NAME = process.env.KEYAUTH_APP_NAME;
const KEYAUTH_APP_SECRET = process.env.KEYAUTH_APP_SECRET;

// Create a new Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// THIS IS NEW: We need a variable to store our KeyAuth session data
let keyauthSession = null;

// THIS IS NEW: A function to initialize the connection with KeyAuth
// THIS IS NEW: A function to initialize the connection with KeyAuth
async function initializeKeyAuth() {
    try {
        console.log('Initializing KeyAuth session...');
        const response = await axios.post(
            'https://keyauth.win/api/1.2/',
            new URLSearchParams({
                type: 'init',
                // ver: '1.2', // <--- REMOVE THIS LINE
                ownerid: KEYAUTH_OWNER_ID,
                name: KEYAUTH_APP_NAME,
                secret: KEYAUTH_APP_SECRET
            })
        );

        const data = response.data;
        if (data.success) {
            keyauthSession = data; // Store the entire successful response
            console.log('✅ KeyAuth session initialized successfully!');
        } else {
            // If initialization fails, log the error and stop the bot.
            console.error(`❌ KeyAuth initialization failed: ${data.message}`);
            process.exit(1); // Exit if we can't connect to KeyAuth
        }
    } catch (error) {
        console.error('❌ Critical error during KeyAuth initialization:', error.message);
        process.exit(1);
    }
}

// Define the slash command
const commands = [
    new SlashCommandBuilder()
        .setName('redeem')
        .setDescription('Redeem a key to get your buyer role.')
        .addStringOption(option =>
            option.setName('key')
                .setDescription('The key you received upon purchase.')
                .setRequired(true))
        .toJSON(),
];

// When the bot is ready, register commands AND initialize KeyAuth
client.on('ready', async () => {
    // THIS IS NEW: Initialize KeyAuth before the bot is fully ready
    await initializeKeyAuth();

    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationGuildCommands(client.application.id, GUILD_ID),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error reloading commands:', error);
    }
    console.log(`Logged in as ${client.user.tag}!`);
});


// Listen for interactions
// Listen for interactions
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'redeem') return;

    // We can't do anything if the KeyAuth session failed to initialize
    if (!keyauthSession) {
        await interaction.reply({ content: '❌ The authentication service is currently unavailable. Please try again later.', ephemeral: true });
        return;
    }

    const member = interaction.member; // We define member here to use it for the check

    // NEW: Check if the user already has the buyer role
    if (member.roles.cache.has(BUYER_ROLE_ID)) {
        await interaction.reply({
            content: 'You already have the buyer role and cannot redeem another key.',
            ephemeral: true // This message is only visible to the user
        });
        return; // Stop the command here
    }

    try {
        await interaction.deferReply({ ephemeral: true });

        const key = interaction.options.getString('key');
        const user = interaction.user;
        
        // Make the API call WITH THE STORED SESSION ID
        const response = await axios.post(
            'https://keyauth.win/api/1.2/',
            new URLSearchParams({
                type: 'license',
                key: key,
                sessionid: keyauthSession.sessionid,
                ownerid: KEYAUTH_OWNER_ID,
                name: KEYAUTH_APP_NAME,
                secret: KEYAUTH_APP_SECRET,
                user: user.id // KeyAuth uses this to link the key to the Discord user ID
            })
        );

        const data = response.data;

        if (data.success) {
            const role = await interaction.guild.roles.fetch(BUYER_ROLE_ID);
            if (role) {
                await member.roles.add(role);
                await interaction.editReply({ content: '✅ Success! Your key has been redeemed and the buyer role has been assigned.' });
                // DM the user for confirmation
                await user.send(`Thank you! Your key \`${key}\` was successfully redeemed in "${interaction.guild.name}".`).catch(() => {
                    console.log(`Could not DM user ${user.id}. They may have DMs disabled.`);
                });
            } else {
                await interaction.editReply({ content: '⚠️ Key was valid, but I could not find the buyer role to assign. Please contact an admin.' });
            }
        } else {
            // This block will now handle errors like "Key has already been redeemed."
            await interaction.editReply({ content: `❌ Redemption failed: ${data.message}` });
        }
    } catch (error) {
        console.error('An error occurred during the redeem interaction:', error.response ? error.response.data : error.message);

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: 'An unexpected server error occurred. Please try again later.' }).catch(console.error);
        }
    }
});

// Log in to Discord
client.login(TOKEN);
