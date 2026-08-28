export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      acoes: {
        Row: {
          ativo: boolean
          criado_em: string
          id: number
          nome: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: never
          nome: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: never
          nome?: string
        }
        Relationships: []
      }
      areas: {
        Row: {
          ativo: boolean
          criado_em: string
          id: number
          nome: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: never
          nome: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: never
          nome?: string
        }
        Relationships: []
      }
      auditoria: {
        Row: {
          ator_id: string | null
          criado_em: string
          dados_antigos: Json | null
          dados_novos: Json | null
          id: number
          operacao: string
          registro_id: string
          tabela: string
        }
        Insert: {
          ator_id?: string | null
          criado_em?: string
          dados_antigos?: Json | null
          dados_novos?: Json | null
          id?: never
          operacao: string
          registro_id: string
          tabela: string
        }
        Update: {
          ator_id?: string | null
          criado_em?: string
          dados_antigos?: Json | null
          dados_novos?: Json | null
          id?: never
          operacao?: string
          registro_id?: string
          tabela?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_ator_id_fkey"
            columns: ["ator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_fotos: {
        Row: {
          checklist_id: number
          criado_em: string
          id: number
          storage_path: string
        }
        Insert: {
          checklist_id: number
          criado_em?: string
          id?: never
          storage_path: string
        }
        Update: {
          checklist_id?: number
          criado_em?: string
          id?: never
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_fotos_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists_visita"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_respostas: {
        Row: {
          checklist_id: number
          observacao: string | null
          pergunta_id: number
          resposta: string
        }
        Insert: {
          checklist_id: number
          observacao?: string | null
          pergunta_id: number
          resposta: string
        }
        Update: {
          checklist_id?: number
          observacao?: string | null
          pergunta_id?: number
          resposta?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_respostas_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists_visita"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_respostas_pergunta_id_fkey"
            columns: ["pergunta_id"]
            isOneToOne: false
            referencedRelation: "perguntas_checklist"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists_visita: {
        Row: {
          assinatura_path: string
          criado_em: string
          id: number
          motivo: string | null
          tipo: string
          visita_id: number
        }
        Insert: {
          assinatura_path: string
          criado_em?: string
          id?: never
          motivo?: string | null
          tipo: string
          visita_id: number
        }
        Update: {
          assinatura_path?: string
          criado_em?: string
          id?: never
          motivo?: string | null
          tipo?: string
          visita_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklists_visita_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: true
            referencedRelation: "visitas"
            referencedColumns: ["id"]
          },
        ]
      }
      coletores_dados: {
        Row: {
          ativo: boolean
          criado_em: string
          id: number
          nome: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: never
          nome: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: never
          nome?: string
        }
        Relationships: []
      }
      eventos: {
        Row: {
          ativo: boolean
          criado_em: string
          id: number
          nome: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: never
          nome: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: never
          nome?: string
        }
        Relationships: []
      }
      grupos_sites: {
        Row: {
          ativo: boolean
          criado_em: string
          descricao: string | null
          grupo_pai_id: number | null
          id: number
          nome: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          grupo_pai_id?: number | null
          id?: never
          nome: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          grupo_pai_id?: number | null
          id?: never
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupos_sites_grupo_pai_id_fkey"
            columns: ["grupo_pai_id"]
            isOneToOne: false
            referencedRelation: "grupos_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      grupos_sites_clientes: {
        Row: {
          criado_em: string
          grupo_site_id: number
          profile_id: string
        }
        Insert: {
          criado_em?: string
          grupo_site_id: number
          profile_id: string
        }
        Update: {
          criado_em?: string
          grupo_site_id?: number
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupos_sites_clientes_grupo_site_id_fkey"
            columns: ["grupo_site_id"]
            isOneToOne: false
            referencedRelation: "grupos_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_sites_clientes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grupos_usuarios: {
        Row: {
          criado_em: string
          descricao: string | null
          id: number
          nome: string
        }
        Insert: {
          criado_em?: string
          descricao?: string | null
          id?: never
          nome: string
        }
        Update: {
          criado_em?: string
          descricao?: string | null
          id?: never
          nome?: string
        }
        Relationships: []
      }
      grupos_usuarios_membros: {
        Row: {
          grupo_id: number
          profile_id: string
        }
        Insert: {
          grupo_id: number
          profile_id: string
        }
        Update: {
          grupo_id?: number
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupos_usuarios_membros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_usuarios_membros_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      importacoes: {
        Row: {
          criado_em: string
          detalhe: Json | null
          http_status: number
          id: number
          id_requisicao: string
          leituras_novas: number
          linhas_recebidas: number
          mensagem: string | null
          origem: string
          status: string
          visitas_gravadas: number
        }
        Insert: {
          criado_em?: string
          detalhe?: Json | null
          http_status: number
          id?: never
          id_requisicao: string
          leituras_novas?: number
          linhas_recebidas?: number
          mensagem?: string | null
          origem: string
          status: string
          visitas_gravadas?: number
        }
        Update: {
          criado_em?: string
          detalhe?: Json | null
          http_status?: number
          id?: never
          id_requisicao?: string
          leituras_novas?: number
          linhas_recebidas?: number
          mensagem?: string | null
          origem?: string
          status?: string
          visitas_gravadas?: number
        }
        Relationships: []
      }
      leituras: {
        Row: {
          acao_id: number | null
          area_id: number | null
          criado_em: string
          data_hora: string
          data_integracao: string | null
          evento_id: number | null
          id: number
          observacao: string | null
          qr_code_id: number | null
          qualificador_id: number | null
          tem_localizacao: boolean
          visita_id: number
        }
        Insert: {
          acao_id?: number | null
          area_id?: number | null
          criado_em?: string
          data_hora: string
          data_integracao?: string | null
          evento_id?: number | null
          id?: never
          observacao?: string | null
          qr_code_id?: number | null
          qualificador_id?: number | null
          tem_localizacao?: boolean
          visita_id: number
        }
        Update: {
          acao_id?: number | null
          area_id?: number | null
          criado_em?: string
          data_hora?: string
          data_integracao?: string | null
          evento_id?: number | null
          id?: never
          observacao?: string | null
          qr_code_id?: number | null
          qualificador_id?: number | null
          tem_localizacao?: boolean
          visita_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "leituras_acao_id_fkey"
            columns: ["acao_id"]
            isOneToOne: false
            referencedRelation: "acoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leituras_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leituras_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leituras_qr_code_id_fkey"
            columns: ["qr_code_id"]
            isOneToOne: false
            referencedRelation: "qr_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leituras_qualificador_id_fkey"
            columns: ["qualificador_id"]
            isOneToOne: false
            referencedRelation: "qualificadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leituras_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visitas"
            referencedColumns: ["id"]
          },
        ]
      }
      metas_visitas: {
        Row: {
          competencia: string
          criado_em: string
          id: number
          quantidade_esperada: number
          site_id: number
        }
        Insert: {
          competencia: string
          criado_em?: string
          id?: never
          quantidade_esperada: number
          site_id: number
        }
        Update: {
          competencia?: string
          criado_em?: string
          id?: never
          quantidade_esperada?: number
          site_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "metas_visitas_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      motivos_visita: {
        Row: {
          ativo: boolean
          criado_em: string
          id: number
          nome: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: never
          nome: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: never
          nome?: string
        }
        Relationships: []
      }
      perguntas_checklist: {
        Row: {
          ativo: boolean
          criado_em: string
          id: number
          ordem: number
          texto: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: never
          ordem: number
          texto: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: never
          ordem?: number
          texto?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          cargo: string
          created_at: string
          email: string
          funcao: string | null
          id: string
          login: string | null
          nome_completo: string | null
          superior_id: string | null
          tipo: string
        }
        Insert: {
          ativo?: boolean
          cargo?: string
          created_at?: string
          email: string
          funcao?: string | null
          id: string
          login?: string | null
          nome_completo?: string | null
          superior_id?: string | null
          tipo?: string
        }
        Update: {
          ativo?: boolean
          cargo?: string
          created_at?: string
          email?: string
          funcao?: string | null
          id?: string
          login?: string | null
          nome_completo?: string | null
          superior_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_superior_id_fkey"
            columns: ["superior_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_codes: {
        Row: {
          ativo: boolean
          codigo: string
          criado_em: string
          finalidade: string | null
          id: number
          site_id: number
        }
        Insert: {
          ativo?: boolean
          codigo: string
          criado_em?: string
          finalidade?: string | null
          id?: never
          site_id: number
        }
        Update: {
          ativo?: boolean
          codigo?: string
          criado_em?: string
          finalidade?: string | null
          id?: never
          site_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "qr_codes_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      qualificadores: {
        Row: {
          ativo: boolean
          criado_em: string
          id: number
          nome: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: never
          nome: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: never
          nome?: string
        }
        Relationships: []
      }
      sites: {
        Row: {
          ativo: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          cod_cliente: string | null
          cod_posto: string | null
          complemento: string | null
          criado_em: string
          criado_por: string | null
          endereco: string | null
          filial: string | null
          gerar_qrcode_automatico: boolean
          gerar_registro_coletas: boolean
          grupo_site_id: number
          id: number
          info_adicional_1: string | null
          info_adicional_2: string | null
          latitude: number | null
          longitude: number | null
          nome: string
          numero: string | null
          observacao: string | null
          pais: string
          raio_metros: number | null
          recebe_visita: boolean
          regional: string | null
          responsavel_id: string | null
          sigla: string | null
          site_superior_id: number | null
          tipo_servico_id: number | null
          uf: string | null
        }
        Insert: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cod_cliente?: string | null
          cod_posto?: string | null
          complemento?: string | null
          criado_em?: string
          criado_por?: string | null
          endereco?: string | null
          filial?: string | null
          gerar_qrcode_automatico?: boolean
          gerar_registro_coletas?: boolean
          grupo_site_id: number
          id?: never
          info_adicional_1?: string | null
          info_adicional_2?: string | null
          latitude?: number | null
          longitude?: number | null
          nome: string
          numero?: string | null
          observacao?: string | null
          pais?: string
          raio_metros?: number | null
          recebe_visita?: boolean
          regional?: string | null
          responsavel_id?: string | null
          sigla?: string | null
          site_superior_id?: number | null
          tipo_servico_id?: number | null
          uf?: string | null
        }
        Update: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cod_cliente?: string | null
          cod_posto?: string | null
          complemento?: string | null
          criado_em?: string
          criado_por?: string | null
          endereco?: string | null
          filial?: string | null
          gerar_qrcode_automatico?: boolean
          gerar_registro_coletas?: boolean
          grupo_site_id?: number
          id?: never
          info_adicional_1?: string | null
          info_adicional_2?: string | null
          latitude?: number | null
          longitude?: number | null
          nome?: string
          numero?: string | null
          observacao?: string | null
          pais?: string
          raio_metros?: number | null
          recebe_visita?: boolean
          regional?: string | null
          responsavel_id?: string | null
          sigla?: string | null
          site_superior_id?: number | null
          tipo_servico_id?: number | null
          uf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_grupo_site_id_fkey"
            columns: ["grupo_site_id"]
            isOneToOne: false
            referencedRelation: "grupos_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_site_superior_id_fkey"
            columns: ["site_superior_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_tipo_servico_id_fkey"
            columns: ["tipo_servico_id"]
            isOneToOne: false
            referencedRelation: "tipos_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_servico: {
        Row: {
          ativo: boolean
          criado_em: string
          id: number
          nome: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: never
          nome: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: never
          nome?: string
        }
        Relationships: []
      }
      visitas: {
        Row: {
          coletor_dados_id: number | null
          criado_em: string
          data_integracao: string | null
          funcionario_id: string | null
          id: number
          motivo_visita_id: number | null
          numero_coleta: number
          site_id: number
        }
        Insert: {
          coletor_dados_id?: number | null
          criado_em?: string
          data_integracao?: string | null
          funcionario_id?: string | null
          id?: never
          motivo_visita_id?: number | null
          numero_coleta: number
          site_id: number
        }
        Update: {
          coletor_dados_id?: number | null
          criado_em?: string
          data_integracao?: string | null
          funcionario_id?: string | null
          id?: never
          motivo_visita_id?: number | null
          numero_coleta?: number
          site_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "visitas_coletor_dados_id_fkey"
            columns: ["coletor_dados_id"]
            isOneToOne: false
            referencedRelation: "coletores_dados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_motivo_visita_id_fkey"
            columns: ["motivo_visita_id"]
            isOneToOne: false
            referencedRelation: "motivos_visita"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      e_cliente: { Args: never; Returns: boolean }
      e_inspetor: { Args: never; Returns: boolean }
      nivel_acesso_atual: { Args: never; Returns: string }
      pode_administrar_cadastros: { Args: never; Returns: boolean }
      pode_administrar_grupos_usuarios: { Args: never; Returns: boolean }
      pode_administrar_usuarios: { Args: never; Returns: boolean }
      pode_ver_grupo_site: { Args: { id_do_grupo: number }; Returns: boolean }
      pode_ver_toda_operacao: { Args: never; Returns: boolean }
      pode_ver_visita: { Args: { id_da_visita: number }; Returns: boolean }
      registrar_checklist: {
        Args: {
          p_assinatura_path: string
          p_fotos: string[]
          p_motivo: string
          p_respostas?: Json
          p_tipo: string
          p_visita_id: number
        }
        Returns: number
      }
      sincronizar_membros_grupo_usuarios: {
        Args: { p_grupo_id: number; p_membros: string[] }
        Returns: undefined
      }
      usuario_ativo: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

