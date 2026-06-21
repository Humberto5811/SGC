// Campo centro (abreviatura GG, OCI, etc.) para importación Excel
export default `
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS centro VARCHAR(30);
`;
