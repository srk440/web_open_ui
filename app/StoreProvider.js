'use client'
import { useEffect, useRef } from 'react'
import { Provider } from 'react-redux'
import { makeStore } from '../lib/store'
import { fetchAddresses } from '../lib/features/address/addressSlice'
import { fetchRatings } from '../lib/features/rating/ratingSlice'
import { setCart } from '../lib/features/cart/cartSlice'
import { getCart, saveCart } from '../lib/mockApi'

export default function StoreProvider({ children }) {
  const storeRef = useRef(undefined)
  if (!storeRef.current) {
    // Create the store instance the first time this renders
    storeRef.current = makeStore()
  }

  // Load data from the mock database after mount (it lives in localStorage,
  // which the server render can't see).
  useEffect(() => {
    const store = storeRef.current
    store.dispatch(fetchAddresses())
    store.dispatch(fetchRatings())

    let unsubscribe = () => {}
    let cancelled = false
    getCart().then(cart => {
      if (cancelled) return
      store.dispatch(setCart(cart))
      // Persist the cart only after restoring it, so the empty initial cart
      // never overwrites the saved one.
      let lastCart = store.getState().cart.cartItems
      unsubscribe = store.subscribe(() => {
        const { cartItems } = store.getState().cart
        if (cartItems !== lastCart) {
          lastCart = cartItems
          saveCart(cartItems)
        }
      })
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return <Provider store={storeRef.current}>{children}</Provider>
}
