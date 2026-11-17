import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import CampoImagem from './CampoImagem'

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:previa')
  URL.revokeObjectURL = vi.fn()
})

const foto = () => new File(['x'], 'eu.png', { type: 'image/png' })

describe('CampoImagem', () => {
  it('escolher uma imagem mostra a prévia e avisa o formulário', async () => {
    const aoMudar = vi.fn()
    const { rerender } = render(<CampoImagem rotulo="foto" atual={null} reserva="AL" valor={null} aoMudar={aoMudar} />)
    const arquivo = foto()
    await userEvent.upload(screen.getByLabelText('Escolher foto'), arquivo)
    expect(aoMudar).toHaveBeenCalledWith({ arquivo })
    rerender(<CampoImagem rotulo="foto" atual={null} reserva="AL" valor={{ arquivo }} aoMudar={aoMudar} />)
    expect(screen.getByRole('img', { name: 'Prévia da foto' })).toHaveAttribute('src', 'blob:previa')
  })

  it('tirar a imagem atual avisa o formulário', async () => {
    const aoMudar = vi.fn()
    render(<CampoImagem rotulo="foto" atual="http://x/foto.webp" reserva="AL" valor={null} aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Tirar foto' }))
    expect(aoMudar).toHaveBeenCalledWith({ tirar: true })
  })

  it('arquivo que não é imagem mostra o aviso e não muda nada', async () => {
    const aoMudar = vi.fn()
    render(<CampoImagem rotulo="logo" atual={null} reserva="AC" valor={null} aoMudar={aoMudar} />)
    const usuario = userEvent.setup({ applyAccept: false })
    await usuario.upload(screen.getByLabelText('Escolher logo'), new File(['x'], 'a.txt', { type: 'text/plain' }))
    expect(aoMudar).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha uma imagem PNG, JPG ou WebP.')
  })

  it('aparência cartão: foto quadrada de 96 px com botão câmera "Trocar a foto" que abre o seletor de arquivo', async () => {
    const aoMudar = vi.fn()
    render(<CampoImagem rotulo="foto" aparencia="cartao" atual="http://x/foto.webp" reserva="AL" valor={null} aoMudar={aoMudar} />)
    expect(screen.getByRole('img', { name: 'Prévia da foto' }).parentElement).toHaveClass('size-24', 'rounded-2xl')
    const camera = screen.getByRole('button', { name: 'Trocar a foto' })
    const clique = vi.spyOn(screen.getByLabelText('Escolher foto'), 'click')
    await userEvent.click(camera)
    expect(clique).toHaveBeenCalled()
    const arquivo = foto()
    await userEvent.upload(screen.getByLabelText('Escolher foto'), arquivo)
    expect(aoMudar).toHaveBeenCalledWith({ arquivo })
    await userEvent.click(screen.getByRole('button', { name: 'Tirar foto' }))
    expect(aoMudar).toHaveBeenCalledWith({ tirar: true })
  })

  it('aparência cartão sem foto mostra a reserva na cor pedida, e o câmera continua lá', () => {
    render(<CampoImagem rotulo="foto" aparencia="cartao" atual={null} reserva="AL" reservaCor="#7c3aed" valor={null} aoMudar={() => {}} />)
    expect(screen.getByText('AL')).toHaveStyle({ backgroundColor: '#7c3aed' })
    expect(screen.getByRole('button', { name: 'Trocar a foto' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tirar foto' })).not.toBeInTheDocument()
  })
})
