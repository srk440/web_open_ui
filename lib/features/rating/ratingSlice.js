import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import * as api from '@/lib/mockApi'

export const fetchRatings = createAsyncThunk('rating/fetchRatings', () => api.getMyRatings())

export const addRating = createAsyncThunk('rating/addRating', (rating) => api.addRating(rating))

const ratingSlice = createSlice({
    name: 'rating',
    initialState: {
        ratings: [],
    },
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(fetchRatings.fulfilled, (state, action) => {
                state.ratings = action.payload
            })
            .addCase(addRating.fulfilled, (state, action) => {
                state.ratings.push(action.payload)
            })
    }
})

export default ratingSlice.reducer
