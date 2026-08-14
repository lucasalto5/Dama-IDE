function isStandaloneResearchRequest(value) {
  const request = String(value || "").trim();
  if (!request || request.length > 1800) return false;
  const asksForInformation = /^(?:pesquis[ae]|procure|busque|descubra|encontre|compare|explique|me\s+diga|quais?|qual|o\s+que|como|onde|existe|existem|tem\s+algum|h[aá]\s+algum)|\b(?:pesquis[ae]|procure|busque|existe(?:m)?|alternativas?|compara[çc][aã]o|not[ií]cias?|fontes?|documenta[çc][aã]o)\b/i.test(request);
  const asksToChangeProject = /\b(?:crie|criar|fa[çc]a|construa|implemente|edite|mude|ajuste|corrija|adicione|remova|instale|execute|rode|arquivo|c[oó]digo|componente|fun[çc][aã]o|localhost|preview|deploy|commit|branch)\b/i.test(request);
  return asksForInformation && !asksToChangeProject;
}

function isDirectConversationRequest(value) {
  const request = String(value || "").trim();
  if (!request || request.length > 1800 || isStandaloneResearchRequest(request)) return false;
  const social = /^(?:oi|ol[aá]|opa|e\s+a[ií]|bom\s+dia|boa\s+tarde|boa\s+noite|obrigad[oa]|valeu|beleza|entendi|show|legal|perfeito)\b/i.test(request);
  const question = /\?$/.test(request) || /^(?:por\s+qu[eê]|porque|ser[aá]\s+que|posso|devo|voc[eê]|o\s+dama|a\s+dama|qual\s+sua|o\s+que\s+voc[eê]\s+acha|(?:tenho\s+)?uma\s+d[uú]vida|queria\s+saber)\b/i.test(request);
  const projectContext = /\b(?:neste|nesse|nesta|nessa|meu|minha)\s+(?:projeto|site|app|aplicativo|c[oó]digo|arquivo|componente|bot[aã]o|fun[çc][aã]o)|\b(?:arquivo|c[oó]digo|linha|stack\s*trace|erro|bug|workspace|reposit[oó]rio|componente|bot[aã]o|localhost|preview|build|teste\s+falhando)\b/i.test(request);
  const asksForAction = /\b(?:crie|criar|fa[çc]a|construa|implemente|edite|mude|ajuste|corrija|adicione|remova|instale|execute|rode|abra|analise|revise|teste)\b/i.test(request);
  return (social || question) && !projectContext && !asksForAction;
}

module.exports = { isStandaloneResearchRequest, isDirectConversationRequest };
