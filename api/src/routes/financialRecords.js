const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const financialRecordsController = require('../controllers/financialRecordsController');

// todas as rotas financeiras exigem autenticação
router.use(auth);

// GET /finance  -> lista registros financeiros do tenant
router.get('/', financialRecordsController.list);

// POST /finance -> cria um lançamento financeiro
router.post('/', financialRecordsController.create);

// GET /finance/:id -> pega um lançamento específico
router.get('/:id', financialRecordsController.getById);

// PUT /finance/:id -> atualiza um lançamento
router.put('/:id', financialRecordsController.update);

// DELETE /finance/:id -> remove um lançamento
router.delete('/:id', financialRecordsController.remove);

module.exports = router;
