// Erreur d'import de média, avec le statut HTTP renvoyé à Publier (lot 3).
// Module à part (lot 8) : partagé par remote-media.ts et http.ts sans
// dépendance circulaire.
export class ImportError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
