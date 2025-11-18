require("dotenv").config();
const express = require("express");
const { ethers } = require("ethers");
const QRCode = require("qrcode");
const cors = require("cors");

// ---------------------------
// GLOBAL FIX – allow BigInt in JSON
// ---------------------------
BigInt.prototype.toJSON = function () {
    return this.toString();
};

// ---------------------------
// CONFIG
// ---------------------------
const app = express();
app.use(cors());
app.use(express.json());

const {
    PRIVATE_KEY,
    SEPOLIA_RPC,
    BSC_TESTNET_RPC
} = process.env;

// BNB relayer wallet
const bnbProvider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC);
const bnbRelayer = new ethers.Wallet(PRIVATE_KEY, bnbProvider);

// Your ICO details
const ICO_ABI = require("./icoAbi.json");
const ICO_ADDRESS = "YOUR_ICO_CONTRACT";

// ETH receiver wallet
const ETH_RECEIVER = "0x30086497c5e5f191878f9e06505d328c2b043E88";

// Conversion rate (DEMO example)
// 1 ETH = 4 BNB → so BNB * 0.25 ETH
const ETH_PER_BNB = 1 / 4;

// ---------------------------
// 1. CREATE QR-CODE Tx API
// ---------------------------

// const generateBNBQRCode = async (receiver, amountBNB, chainId) => {
//     try {
//         // Convert BNB → wei
//         const amountInWei = BigInt(amountBNB * 1e18).toString();
//         // EIP-681 URI
//         const uri = `ethereum:${receiver}@${chainId}?value=${amountInWei}`;
//         console.log(":link: Payment URI:", uri);
//         // QR code in terminal
//         const qrCode = await QRCode.toString(uri, { type: "terminal", small: true });
//         console.log("\n:coin: Scan this QR code with MetaMask / Trust Wallet :\n");
//         console.log(qrCode);
//         return { uri, qrCode };
//     } catch (err) {
//         console.error(":x: Error:", err.message);
//     }
// };

const generateBNBQRCode = async (receiver, amountBNB, chainId) => {
    try {
        const amountInWei = BigInt(amountBNB * 1e18).toString();

        const uri = `ethereum:${receiver}@${chainId}?value=${amountInWei}`;
        console.log("Payment URI:", uri);

        // Generate PNG IMAGE instead of terminal ASCII
        const qrPng = await QRCode.toDataURL(uri);

        return { uri, qrPng };
    } catch (err) {
        console.error("QR generation error:", err);
        throw err;
    }
};


app.post("/create-qr-tx", async (req, res) => {
    try {
        const {
            bnbUserAddress,
            saleType,
            tokenAddress,
            amountInWei,
            referrer
        } = req.body;

        // Convert BNB wei → BNB float
        const bnbAmount = Number(amountInWei) / 1e18;

        // Convert to ETH
        const ethRequired = bnbAmount * ETH_PER_BNB;

        // FIX: await required
        const { uri, qrPng } = await generateBNBQRCode(
            ETH_RECEIVER,
            ethRequired,
            11155111
        );

        res.json({
            success: true,
            qr: qrPng,
            encodedTx: uri,
            bnbUserAddress,
            saleType,
            tokenAddress,
            amountInWei, // already a string
            referrer,
            message: "Scan this QR with an Ethereum wallet"
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ---------------------------
// 2. TRIGGER BSC BUY AFTER ETH PAYMENT
// ---------------------------
app.post("/trigger-buy", async (req, res) => {
    try {
        const { saleType, tokenAddress, amountInWei, referrer } = req.body;

        const ico = new ethers.Contract(ICO_ADDRESS, ICO_ABI, bnbRelayer);

        const tx = await ico.buy(
            saleType,
            tokenAddress,
            amountInWei,
            referrer
        );

        const receipt = await tx.wait();

        res.json({
            success: true,
            message: "ICO buy completed on BSC",
            hash: receipt.hash
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ---------------------------
// START SERVER
// ---------------------------
app.listen(5000, () => {
    console.log("Backend running on port 5000");
});
