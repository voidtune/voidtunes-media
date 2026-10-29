
const express = require("express");
const multer = require("multer");
const cors = require("cors");

const app = express();
app.use(express.json());
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

app.use(cors({
  origin: "https://voidtune.github.io",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "x-import-password"]
}));

const API_KEY = process.env.ROBLOX_API_KEY;
const USER_ID = process.env.ROBLOX_USER_ID;
const IMPORT_PASSWORD = process.env.IMPORT_PASSWORD;

const TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/bmp": "bmp"
};

// Protège les routes liées à l'importation
function requireImportPassword(req, res, next) {
  if (!IMPORT_PASSWORD) {
    return res.status(503).json({
      error: "Mot de passe d'importation non configuré."
    });
  }

  const suppliedPassword = req.get("x-import-password");

  if (
    typeof suppliedPassword !== "string" ||
    suppliedPassword.length > 200 ||
    suppliedPassword !== IMPORT_PASSWORD
  ) {
    return res.status(401).json({
      error: "Mot de passe incorrect."
    });
  }

  next();
}

app.get("/", (req, res) => {
  res.send("VoidTunes API en ligne");
});

app.post(
  "/api/upload",
  requireImportPassword,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!API_KEY || !USER_ID) {
        return res.status(500).json({
          error: "Configuration du serveur manquante."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: "Aucune image reçue."
        });
      }

      const extension = TYPES[req.file.mimetype];

      if (!extension) {
        return res.status(400).json({
          error: "Format accepté : PNG, JPEG ou BMP."
        });
      }

      const form = new FormData();

      form.append("request", JSON.stringify({
        assetType: "Image",
        displayName: `VoidTunes-${Date.now()}`,
        description: "Image importée depuis VoidTunes",
        creationContext: {
          creator: {
            userId: String(USER_ID)
          }
        }
      }));

      form.append(
        "fileContent",
        new Blob([req.file.buffer], {
          type: req.file.mimetype
        }),
        `image.${extension}`
      );

      const response = await fetch(
        "https://apis.roblox.com/assets/v1/assets",
        {
          method: "POST",
          headers: {
            "x-api-key": API_KEY
          },
          body: form
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Roblox API:", data);

        return res.status(response.status).json({
          error: data.message || "Roblox a refusé l'importation."
        });
      }

      const operationId = data.path?.split("/").pop();

      if (!operationId) {
        return res.status(502).json({
          error: "Identifiant d'opération manquant."
        });
      }

      return res.json({ operationId });
    } catch (error) {
      console.error("Erreur d'importation :", error);

      return res.status(500).json({
        error: "Erreur pendant l'importation."
      });
    }
  }
);

app.get(
  "/api/status/:id",
  requireImportPassword,
  async (req, res) => {
    try {
      if (!API_KEY) {
        return res.status(500).json({
          error: "Clé API absente."
        });
      }

      const id = req.params.id;

      if (!/^[\w-]+$/.test(id)) {
        return res.status(400).json({
          error: "Identifiant invalide."
        });
      }

      const response = await fetch(
        `https://apis.roblox.com/assets/v1/operations/${encodeURIComponent(id)}`,
        {
          headers: {
            "x-api-key": API_KEY
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          error: data.message || "Impossible de vérifier l'import."
        });
      }

      if (!data.done) {
        return res.json({ done: false });
      }

      const assetId = data.response?.assetId;

      if (!assetId) {
        return res.status(400).json({
          error: data.error?.message || "L'importation a échoué."
        });
      }

      return res.json({
        done: true,
        assetId: String(assetId),
        image: `rbxassetid://${assetId}`
      });
    } catch (error) {
      console.error("Erreur de vérification :", error);

      return res.status(500).json({
        error: "Erreur de vérification."
      });
    }
  }
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`VoidTunes API démarrée sur le port ${PORT}`);
});
