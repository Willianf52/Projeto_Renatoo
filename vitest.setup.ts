// Matchers como toBeInTheDocument()/toHaveTextContent() para os testes de
// componente. Seguro para os testes em ambiente "node" tambem -- so estende
// `expect`, nao depende de DOM para ser importado.
import "@testing-library/jest-dom/vitest";
