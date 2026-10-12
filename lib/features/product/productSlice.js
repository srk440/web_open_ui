import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import * as api from '@/lib/mockApi'

export const fetchProducts = createAsyncThunk('product/fetchProducts', () => api.getProducts())

const productSlice = createSlice({
    name: 'product',
    initialState: {
        list: [],
        loaded: false,
    },
    reducers: {
        setProduct: (state, action) => {
            state.list = action.payload
        },
        clearProduct: (state) => {
            state.list = []
        }
    },
    extraReducers: (builder) => {
        builder.addCase(fetchProducts.fulfilled, (state, action) => {
            state.list = action.payload
            state.loaded = true
        })
    }
})

export const { setProduct, clearProduct } = productSlice.actions

export default productSlice.reducer
