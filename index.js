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
const KEYAUTH_SELLER_KEY = process.env.KEYAUTH_SELLER_KEY;

// Create a new Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

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

// Register slash commands with Discord when the bot is ready
client.on('ready', async () => {
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
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'redeem') return;

    const key = interaction.options.getString('key');
    const user = interaction.user;
    const member = interaction.member;

    await interaction.deferReply({ ephemeral: true });

    try {
        // Prepare data for the KeyAuth API
        const apiData = new URLSearchParams({
            type: 'license',
            key: key,
            ownerid: KEYAUTH_OWNER_ID,
            name: KEYAUTH_APP_NAME,
            sellerkey: KEYAUTH_SELLER_KEY,
            user: user.id 
        });

        // Make the POST request to the KeyAuth API
        const response = await axios.post('https://keyauth.win/api/seller/', apiData);

        const data = response.data;

        // Check the API response
        if (data.success) {
            // SUCCESS: The key is valid
            const role = await interaction.guild.roles.fetch(BUYER_ROLE_ID);
            if (role) {
                await member.roles.add(role);
                await interaction.editReply({ content: '✅ Success! Your key has been redeemed and the buyer role has been assigned.' });
                await user.send(`Thank you for your purchase! Your key \`${key}\` was successfully redeemed in "${interaction.guild.name}".`).catch(() => {});
            } else {
                await interaction.editReply({ content: '⚠️ Key was valid, but I could not find the buyer role to assign. Please contact an admin.' });
            }
        } else {
            // FAILURE: The key is invalid
            await interaction.editReply({ content: `❌ Redemption failed: ${data.message}` });
        }
    } catch (error) {
        console.error('Error calling KeyAuth API:', error);
        await interaction.editReply({ content: 'An unexpected error occurred. Please try again later.' });
    }
});

// Log in to Discord
client.login(TOKEN);
