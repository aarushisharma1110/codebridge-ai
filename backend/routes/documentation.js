const express = require('express');
const swaggerUi = require('swagger-ui-express');
const definition = require('../docs/openapi.json');

function createDocumentationRouter(enableDatabaseDiagnostic) {
    const router = express.Router();
    const spec = structuredClone(definition);
    // Describe the operations actually enabled in this application instance.
    if (!enableDatabaseDiagnostic) delete spec.paths['/db-test'];
    router.get('/openapi.json', (req, res) => res.json(spec));
    router.use(swaggerUi.serve, swaggerUi.setup(null, {
        customSiteTitle: 'CodeBridge AI API Documentation',
        swaggerOptions: {
            url: './openapi.json',
            withCredentials: true,
            validatorUrl: null,
            persistAuthorization: false
        }
    }));
    return router;
}

module.exports = createDocumentationRouter;
