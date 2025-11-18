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
app.post("/create-qr-tx", async (req, res) => {
    try {
        const {
            bnbUserAddress,
            saleType,
            tokenAddress,
            amountInWei,
            referrer
        } = req.body;


        // Convert BNB amount → ETH
        const bnbAmount = Number(amountInWei) / 1e18;
        const ethRequired = bnbAmount * ETH_PER_BNB;

        // Convert to Wei (BigInt)
        const ethValue = ethers.parseEther(ethRequired.toString());

        const tx = {
            to: ETH_RECEIVER,
            value: ethValue.toString(), // FIX
            data: "0x"
        };

        // QR code expects stringifiable object
        const qrPayload = {
            to: ETH_RECEIVER,
            value: ethValue.toString()
        };

        const qrString = JSON.stringify(qrPayload);
        const qrCodeBase64 = await QRCode.toDataURL(qrString);

        res.json({
            success: true,
            qr: qrCodeBase64,
            encodedTx: qrPayload,
            bnbUserAddress,
            saleType,
            tokenAddress,
            amountInWei: amountInWei.toString(),
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
