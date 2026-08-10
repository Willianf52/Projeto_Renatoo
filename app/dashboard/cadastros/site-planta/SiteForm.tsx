"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/dashboard/icons";
import { getInputClasses } from "@/components/FormField";
import { salvarSite, type EstadoDoFormulario, type ValoresDoSite } from "./actions";
import type { Opcao } from "./queries";

const LISTAGEM = "/dashboard/cadastros/site-planta";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

function Campo({
  id,
  rotulo,
  obrigatorio,
  children,
  className = "",
}: {
  id: string;
  rotulo: string;
  obrigatorio?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className={rotuloClasses}>
        {rotulo}
        {obrigatorio && <span className="text-red-400"> *</span>}
      </label>
      {children}
    </div>
  );
}

/**
 * Select do formulario, nao do filtro. `FilterSelect` nao serve aqui: ele usa
 * a primeira opcao como rotulo flutuante (nao ha `<label>` na barra de
 * filtros) e pinta o texto de `brand-muted`. Num formulario o valor escolhido
 * precisa ler como valor preenchido, e o rotulo e um `<label>` de verdade.
 */
function Select({
  id,
  name,
  options,
  defaultValue,
  required,
  vazio,
  comVazio = true,
}: {
  id: string;
  name: string;
  options: Opcao[];
  defaultValue: string;
  required?: boolean;
  vazio: string;
  /** `false` tira a opcao em branco -- usado em "Status", cuja coluna e
   * boolean `not null`: nao ha estado "nenhum" legitimo para oferecer. */
  comVazio?: boolean;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        name={name}
        required={required}
        defaultValue={defaultValue}
        className={`peer ${getInputClasses(false)} appearance-none pr-9`}
      >
        {comVazio && <option value="">{vazio}</option>}
        {options.map((opcao) => (
          <option key={opcao.value} value={opcao.value}>
            {opcao.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
    </div>
  );
}

/** Campo de texto simples -- o formulario tem mais de uma dezena deles, e
 * repetir a marcacao inteira em cada um so espalha oportunidade de divergir.
 * `inputRef` e separado de `resto` porque `ref` nao passa por spread de props
 * comuns sem `forwardRef`; aqui basta encaminhar manualmente. */
function Texto({
  id,
  rotulo,
  valor,
  obrigatorio,
  inputRef,
  className = "",
  ...resto
}: {
  id: string;
  rotulo: string;
  valor: string;
  obrigatorio?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Campo id={id} rotulo={rotulo} obrigatorio={obrigatorio} className={className}>
      <input
        id={id}
        name={id}
        type="text"
        ref={inputRef}
        defaultValue={valor}
        className={getInputClasses(false)}
        {...resto}
      />
    </Campo>
  );
}

function Checkbox({ id, rotulo, marcado }: { id: string; rotulo: string; marcado: boolean }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-white">
      <input
        id={id}
        name={id}
        type="checkbox"
        defaultChecked={marcado}
        className="h-4 w-4 rounded border-slate-700 bg-brand-navy accent-brand-green"
      />
      {rotulo}
    </label>
  );
}

const STATUS_OPCOES: Opcao[] = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];

export function SiteForm({
  id,
  valoresIniciais,
  opcoes,
  sitesSuperiores,
}: {
  /** Ausente na criacao; presente na edicao. */
  id?: number;
  valoresIniciais: ValoresDoSite;
  opcoes: { gruposSites: Opcao[]; tiposServico: Opcao[]; responsaveis: Opcao[] };
  /** Migration 0021. Ja vem sem o proprio site em edicao -- ver
   * `getSitesParaSuperior`. */
  sitesSuperiores: Opcao[];
}) {
  const [estado, formAction, enviando] = useActionState<EstadoDoFormulario, FormData>(
    salvarSite,
    {},
  );

  // Depois de uma recusa, o formulario volta com o que a pessoa tinha digitado,
  // e nao com o valor original do banco.
  const valores = estado.valores ?? valoresIniciais;

  const cepRef = useRef<HTMLInputElement>(null);
  const enderecoRef = useRef<HTMLInputElement>(null);
  const bairroRef = useRef<HTMLInputElement>(null);
  const cidadeRef = useRef<HTMLInputElement>(null);
  const ufRef = useRef<HTMLInputElement>(null);
  const latitudeRef = useRef<HTMLInputElement>(null);
  const longitudeRef = useRef<HTMLInputElement>(null);

  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState<string | null>(null);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [erroGps, setErroGps] = useState<string | null>(null);

  /**
   * Preenche Endereço/Bairro/Cidade/UF a partir do CEP, via ViaCEP (API
   * pública, sem chave). Só ajuda a digitar -- quem preenche os campos manda
   * o que quiser no submit, a busca não valida nada sozinha.
   */
  async function buscarCep() {
    const digitos = (cepRef.current?.value ?? "").replace(/\D/g, "");
    if (digitos.length !== 8) {
      setErroCep("Informe um CEP com 8 dígitos.");
      return;
    }

    setErroCep(null);
    setBuscandoCep(true);
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
      const dados = await resposta.json();

      if (dados.erro) {
        setErroCep("CEP não encontrado.");
        return;
      }

      if (enderecoRef.current) enderecoRef.current.value = dados.logradouro ?? "";
      if (bairroRef.current) bairroRef.current.value = dados.bairro ?? "";
      if (cidadeRef.current) cidadeRef.current.value = dados.localidade ?? "";
      if (ufRef.current) ufRef.current.value = dados.uf ?? "";
    } catch {
      setErroCep("Não foi possível buscar o CEP agora. Tente novamente.");
    } finally {
      setBuscandoCep(false);
    }
  }

  /** Captura a posição atual do navegador em Latitude/Longitude. Pede
   * permissão do próprio navegador -- nada aqui contorna esse aviso. */
  function capturarGps() {
    if (!navigator.geolocation) {
      setErroGps("Seu navegador não oferece geolocalização.");
      return;
    }

    setErroGps(null);
    setBuscandoGps(true);
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        if (latitudeRef.current) latitudeRef.current.value = posicao.coords.latitude.toFixed(7);
        if (longitudeRef.current) longitudeRef.current.value = posicao.coords.longitude.toFixed(7);
        setBuscandoGps(false);
      },
      () => {
        setErroGps("Não foi possível obter sua localização. Verifique a permissão do navegador.");
        setBuscandoGps(false);
      },
    );
  }

  return (
    <form action={formAction} className="space-y-4 p-4">
      {id !== undefined && <input type="hidden" name="id" value={id} />}

      {estado.erro && (
        <p
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {estado.erro}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Texto id="regional" rotulo="Regional" valor={valores.regional} />

        <Campo id="site_superior_id" rotulo="Site Superior">
          <Select
            id="site_superior_id"
            name="site_superior_id"
            options={sitesSuperiores}
            defaultValue={valores.siteSuperiorId}
            vazio="Raiz"
          />
        </Campo>

        <Campo id="nome" rotulo="Nome do Site" obrigatorio>
          <input
            id="nome"
            name="nome"
            type="text"
            required
            defaultValue={valores.nome}
            aria-invalid={Boolean(estado.erro)}
            className={getInputClasses(Boolean(estado.erro))}
          />
        </Campo>

        {/* Junto do Nome do Site, como na referencia -- as duas flags mais
            comuns de um site novo, sem precisar rolar ate o fim do formulario
            para achá-las. */}
        <div className="flex items-center gap-5 sm:pt-6">
          <Checkbox id="recebe_visita" rotulo="Recebe visita" marcado={valores.recebeVisita} />
          <Checkbox
            id="gerar_qrcode_automatico"
            rotulo="Gerar QR-Code automático"
            marcado={valores.gerarQrcodeAutomatico}
          />
        </div>

        <Texto id="sigla" rotulo="Nome abreviado do site" valor={valores.sigla} />

        <Campo id="responsavel_id" rotulo="Responsável">
          <Select
            id="responsavel_id"
            name="responsavel_id"
            options={opcoes.responsaveis}
            defaultValue={valores.responsavelId}
            vazio="Nenhum"
          />
        </Campo>

        <Campo id="observacao" rotulo="Observação" className="sm:col-span-2">
          <textarea
            id="observacao"
            name="observacao"
            rows={3}
            defaultValue={valores.observacao}
            className={`${getInputClasses(false)} resize-y`}
          />
        </Campo>

        <Campo id="tipo_servico_id" rotulo="Tipo de Serviço">
          <Select
            id="tipo_servico_id"
            name="tipo_servico_id"
            options={opcoes.tiposServico}
            defaultValue={valores.tipoServicoId}
            vazio="Nenhum"
          />
        </Campo>

        <Campo id="grupo_site_id" rotulo="Grupo de Sites" obrigatorio>
          <Select
            id="grupo_site_id"
            name="grupo_site_id"
            required
            options={opcoes.gruposSites}
            defaultValue={valores.grupoSiteId}
            vazio="Selecione..."
          />
        </Campo>

        <div>
          <label htmlFor="cep" className={rotuloClasses}>
            CEP
          </label>
          <div className="flex gap-2">
            <input
              id="cep"
              name="cep"
              type="text"
              ref={cepRef}
              inputMode="numeric"
              defaultValue={valores.cep}
              className={getInputClasses(false)}
            />
            <button
              type="button"
              onClick={buscarCep}
              disabled={buscandoCep}
              className="shrink-0 rounded-md bg-brand-blue px-4 text-sm font-medium text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {buscandoCep ? "Buscando..." : "Procurar CEP"}
            </button>
          </div>
          {erroCep && <p className="mt-1.5 text-xs text-red-400">{erroCep}</p>}
        </div>

        <Texto id="endereco" rotulo="Endereço" valor={valores.endereco} inputRef={enderecoRef} />

        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <div>
            <label htmlFor="numero" className={rotuloClasses}>
              Número
            </label>
            <div className="flex gap-2">
              {/* Texto e nao number: "123-A", "s/n" e "km 12" sao numeros de
                  porta legitimos, e nenhum deles cabe num campo numerico. */}
              <input
                id="numero"
                name="numero"
                type="text"
                defaultValue={valores.numero}
                className={getInputClasses(false)}
              />
              <button
                type="button"
                onClick={capturarGps}
                disabled={buscandoGps}
                className="shrink-0 rounded-md bg-brand-blue px-3 text-sm font-medium text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {buscandoGps ? "..." : "GPS"}
              </button>
            </div>
          </div>

          <Texto id="bairro" rotulo="Bairro" valor={valores.bairro} inputRef={bairroRef} />
          <Texto id="complemento" rotulo="Complemento" valor={valores.complemento} />
        </div>
        {erroGps && <p className="-mt-2 text-xs text-red-400 sm:col-span-2">{erroGps}</p>}

        <Texto id="pais" rotulo="País" valor={valores.pais} />
        <div />

        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <Campo id="uf" rotulo="UF">
            <input
              id="uf"
              name="uf"
              type="text"
              maxLength={2}
              ref={ufRef}
              defaultValue={valores.uf}
              // `uf` e char(2) no banco: maxLength evita a viagem ao servidor
              // no caso comum, mas quem valida de verdade e a action --
              // maxLength nao sobrevive a um POST montado a mao.
              className={`${getInputClasses(false)} uppercase`}
            />
          </Campo>

          <Campo id="cidade" rotulo="Cidade" className="col-span-2">
            <input
              id="cidade"
              name="cidade"
              type="text"
              ref={cidadeRef}
              defaultValue={valores.cidade}
              className={getInputClasses(false)}
            />
          </Campo>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <Texto
            id="latitude"
            rotulo="Latitude"
            valor={valores.latitude}
            inputRef={latitudeRef}
            inputMode="decimal"
          />
          <Texto
            id="longitude"
            rotulo="Longitude"
            valor={valores.longitude}
            inputRef={longitudeRef}
            inputMode="decimal"
          />
          <Texto
            id="raio_metros"
            rotulo="Raio (metros)"
            valor={valores.raioMetros}
            inputMode="numeric"
          />
        </div>

        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <Texto id="cod_cliente" rotulo="Cód. Cliente" valor={valores.codCliente} />
          <Texto id="cod_posto" rotulo="Cód. Posto" valor={valores.codPosto} />
          <Texto id="filial" rotulo="Filial" valor={valores.filial} />
        </div>

        <Texto
          id="info_adicional_1"
          rotulo="Informações Adicionais 1"
          valor={valores.infoAdicional1}
          className="sm:col-span-2"
        />
        <Texto
          id="info_adicional_2"
          rotulo="Informações Adicionais 2"
          valor={valores.infoAdicional2}
          className="sm:col-span-2"
        />

        <Campo id="status" rotulo="Status">
          <Select
            id="status"
            name="status"
            options={STATUS_OPCOES}
            defaultValue={valores.ativo ? "ativo" : "inativo"}
            vazio="Selecione"
            comVazio={false}
          />
        </Campo>

        <div className="flex items-center sm:pt-6">
          <Checkbox
            id="gerar_registro_coletas"
            rotulo="Gerar registro em Coletas Importadas"
            marcado={valores.gerarRegistroColetas}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={enviando}
          className="flex h-10 items-center justify-center rounded-md bg-brand-green px-6 text-sm font-semibold text-brand-navy shadow-sm transition-all duration-200 hover:bg-brand-green-hover hover:shadow-lg hover:shadow-brand-green/30 focus:outline-none focus:ring-2 focus:ring-brand-green active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-sm disabled:active:scale-100"
        >
          {enviando ? "Salvando..." : "Salvar"}
        </button>
        <Link
          href={LISTAGEM}
          className="flex h-10 items-center justify-center rounded-md border border-slate-800 px-6 text-sm font-medium text-brand-muted transition-colors duration-200 hover:bg-brand-navy hover:text-white"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
