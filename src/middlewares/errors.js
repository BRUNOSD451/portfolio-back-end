export function notFound(req, res) {
  return res.status(404).json({ message: "Rota não encontrada." });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if ([400, 413, 415, 429].includes(error.status))
    return res.status(error.status).json({ message: error.message });
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ message: "JSON inválido." });
  }
  if (error.type === "entity.too.large") {
    return res
      .status(413)
      .json({ message: "Corpo da requisição muito grande." });
  }
  console.error("Erro não tratado:", error.code || error.name);
  return res.status(500).json({ message: "Erro interno do servidor." });
}
