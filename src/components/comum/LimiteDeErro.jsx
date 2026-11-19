import { Component } from 'react'

// Limite de erro: se algo dentro dele quebra ao mostrar (ex.: a parte da tela carregada sob demanda não veio, sem internet
// ou com o app atualizado), mostra `reserva` no lugar, sem derrubar a tela inteira. Para tentar de novo, quem usa troca a
// `key` (o limite começa do zero).
export default class LimiteDeErro extends Component {
  state = { erro: null }

  static getDerivedStateFromError(erro) {
    return { erro }
  }

  render() {
    return this.state.erro ? this.props.reserva : this.props.children
  }
}
